import { lookup } from "node:dns/promises";
import net from "node:net";
import { prisma, type Prisma } from "@jobcopilot/db";
import type { ExtractedProject, PortfolioAnalysis } from "@jobcopilot/shared";
import { badRequest, unprocessable } from "./errors.js";
import { heuristicExtraction } from "./resume-parser.js";

/**
 * Phase 22 — user-authorized public portfolio analysis.
 *
 * Safety: only public http(s) URLs; DNS-resolved private/loopback/link-local
 * addresses are rejected; redirects are followed manually and re-validated;
 * responses are time- and size-bounded. GitHub uses the public REST API only
 * (no private repos, no credentials). Failures are reported honestly and
 * never replaced with invented projects.
 */

const MAX_BYTES = 1_000_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 8000;

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    const [a, b] = parts;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    return (
      lower === "::1" ||
      lower === "::" ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("fe80") ||
      lower.startsWith("::ffff:127.") ||
      lower.startsWith("::ffff:10.") ||
      lower.startsWith("::ffff:192.168.")
    );
  }
  return true;
}

async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw badRequest("Enter a valid http(s) URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw badRequest("Only http(s) URLs are supported.");
  }
  if (url.username || url.password) throw badRequest("URLs with embedded credentials are not allowed.");
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(url.hostname)) {
    throw badRequest("This host cannot be analysed.");
  }
  let addresses;
  try {
    addresses = await lookup(url.hostname, { all: true, verbatim: true });
  } catch {
    throw unprocessable("Could not resolve this URL.");
  }
  if (addresses.length === 0) throw unprocessable("Could not resolve this URL.");
  if (addresses.some((a) => isPrivateIp(a.address))) {
    throw badRequest("This URL points to a private address and cannot be analysed.");
  }
  return url;
}

async function readBounded(res: Response): Promise<Buffer> {
  const contentLength = Number(res.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BYTES) throw unprocessable("This page is too large to analyse.");
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw unprocessable("This page is too large to analyse.");
      }
      chunks.push(value);
    }
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

async function fetchPublic(raw: string, accept: string): Promise<{ url: URL; res: Response; body: Buffer }> {
  let current = await assertPublicUrl(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const res = await fetch(current, {
      redirect: "manual",
      headers: { "user-agent": "JobPilotBot/1.0 (+portfolio-analysis)", accept },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw unprocessable("The page redirected without a destination.");
      current = await assertPublicUrl(new URL(location, current).toString());
      continue;
    }
    if (!res.ok) {
      throw unprocessable(`The page returned HTTP ${res.status}.`);
    }
    const body = await readBounded(res);
    return { url: current, res, body };
  }
  throw unprocessable("Too many redirects.");
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<[^>]+>/g, "\n"),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim()
    .slice(0, 60_000);
}

function githubTarget(url: URL): { kind: "user" | "repo"; owner: string; repo?: string } | null {
  if (!/(^|\.)github\.com$/i.test(url.hostname)) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length === 0) return null;
  if (parts[0] === "orgs" && parts[1]) return { kind: "user", owner: parts[1] };
  if (parts.length === 1) return { kind: "user", owner: parts[0] };
  return { kind: "repo", owner: parts[0], repo: parts[1] };
}

async function githubJson(path: string): Promise<unknown> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { "user-agent": "JobPilotBot/1.0", accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 404) throw unprocessable("That GitHub profile or repository is not public.");
  if (res.status === 403 || res.status === 429) {
    throw unprocessable("GitHub's public API is rate-limited right now. Try again later.");
  }
  if (!res.ok) throw unprocessable(`GitHub returned HTTP ${res.status}.`);
  return res.json();
}

function repoProjects(repos: unknown): ExtractedProject[] {
  if (!Array.isArray(repos)) return [];
  const out: ExtractedProject[] = [];
  for (const item of repos) {
    if (!item || typeof item !== "object") continue;
    const repo = item as Record<string, unknown>;
    if (repo.fork === true) continue;
    const name = typeof repo.name === "string" ? repo.name : "";
    if (!name) continue;
    const description = typeof repo.description === "string" ? repo.description : "";
    const language = typeof repo.language === "string" ? repo.language : "";
    const topics = Array.isArray(repo.topics)
      ? repo.topics.filter((t): t is string => typeof t === "string")
      : [];
    out.push({
      name: name.slice(0, 200),
      description: description.slice(0, 5000) || `Public GitHub repository: ${name}`,
      technologies: [...new Set([language, ...topics].filter(Boolean))].slice(0, 30),
    });
    if (out.length >= 30) break;
  }
  return out;
}

async function analyzeGithub(url: URL): Promise<PortfolioAnalysis> {
  const target = githubTarget(url);
  if (!target) throw badRequest("Not a GitHub URL.");
  if (target.kind === "repo" && target.repo) {
    const repo = (await githubJson(`/repos/${target.owner}/${target.repo}`)) as Record<string, unknown>;
    const projects = repoProjects([repo]);
    return {
      accessible: true,
      url: url.toString(),
      kind: "github",
      projects,
      skills: heuristicExtraction(projects.map((p) => `${p.name} ${p.description} ${p.technologies.join(" ")}`).join("\n")).skills,
      error: null,
      warnings: ["Only public GitHub repository metadata was used."],
    };
  }
  const repos = await githubJson(`/users/${target.owner}/repos?per_page=30&sort=updated`);
  const projects = repoProjects(repos);
  return {
    accessible: true,
    url: url.toString(),
    kind: "github",
    projects,
    skills: heuristicExtraction(projects.map((p) => `${p.name} ${p.description} ${p.technologies.join(" ")}`).join("\n")).skills,
    error: null,
    warnings: [
      "Only public GitHub repositories were read; private repos and account details were not accessed.",
    ],
  };
}

async function analyzeWebsite(url: URL): Promise<PortfolioAnalysis> {
  const { res, body } = await fetchPublic(url.toString(), "text/html,application/xhtml+xml,text/plain;q=0.8");
  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.includes("text/html") && !contentType.includes("text/plain") && !contentType.includes("xhtml")) {
    throw unprocessable("This URL did not return a readable web page.");
  }
  const text = htmlToText(body.toString("utf8"));
  const extraction = heuristicExtraction(text);
  return {
    accessible: true,
    url: url.toString(),
    kind: "website",
    projects: extraction.projects.slice(0, 30),
    skills: extraction.skills.slice(0, 200),
    error: null,
    warnings:
      extraction.projects.length === 0
        ? ["No project sections were detected on this page; only visible text was analysed."]
        : [],
  };
}

async function persistPortfolio(
  userId: string,
  analysis: PortfolioAnalysis,
): Promise<void> {
  for (const project of analysis.projects.slice(0, 30)) {
    const existing = await prisma.project.findFirst({
      where: { userId, name: project.name },
    });
    const payload = {
      description: (project.description || project.name).slice(0, 5000),
      technologies: project.technologies.slice(0, 30),
      ...(analysis.kind === "github" ? { githubUrl: analysis.url } : { liveUrl: analysis.url }),
    };
    if (existing) {
      await prisma.project.update({ where: { id: existing.id }, data: payload });
    } else {
      await prisma.project.create({
        data: { userId, name: project.name.slice(0, 200), ...payload },
      });
    }
  }

  const profile = await prisma.profile.findUnique({ where: { userId } });
  const skillNames = analysis.skills.map((s) => s.name);
  if (profile) {
    const merged = [...new Set([...profile.skills, ...skillNames])].slice(0, 200);
    await prisma.profile.update({
      where: { userId },
      data: {
        skills: merged,
        ...(analysis.kind === "github" ? { githubUrl: analysis.url } : { portfolioUrl: analysis.url }),
      },
    });
  } else if (skillNames.length > 0) {
    await prisma.profile.create({
      data: {
        userId,
        skills: skillNames.slice(0, 200),
        ...(analysis.kind === "github" ? { githubUrl: analysis.url } : { portfolioUrl: analysis.url }),
      } as Prisma.ProfileUncheckedCreateInput,
    });
  }
}

export async function analyzePortfolio(userId: string, rawUrl: string): Promise<PortfolioAnalysis> {
  const url = await assertPublicUrl(rawUrl);
  try {
    const analysis = url.hostname.toLowerCase().includes("github.com")
      ? await analyzeGithub(url)
      : await analyzeWebsite(url);
    await persistPortfolio(userId, analysis);
    return analysis;
  } catch (err) {
    const message =
      err instanceof Error && (err as { status?: unknown }).status
        ? err.message
        : "Could not analyse this URL. Check that it is public and reachable.";
    return {
      accessible: false,
      url: url.toString(),
      kind: url.hostname.toLowerCase().includes("github.com") ? "github" : "website",
      projects: [],
      skills: [],
      error: message.slice(0, 500),
      warnings: [],
    };
  }
}
