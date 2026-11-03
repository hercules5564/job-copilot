import { prisma } from "@jobcopilot/db";
import type { EmailMatchStatus, NormalizedEmail } from "@jobcopilot/shared";

/**
 * Phase 6 — deterministic application-email matcher.
 * Evidence-first: thread-unsafe guesses are never made. Ambiguous cases
 * return NEEDS_REVIEW with candidates; weak cases return UNMATCHED.
 * Never silently attaches an email to the wrong application.
 */

export interface MatchCandidate {
  applicationId: string;
  jobTitle: string;
  companyName: string;
  score: number;
  reason: string;
}

export interface EmailMatchOutcome {
  applicationId: string | null;
  status: EmailMatchStatus;
  score: number;
  reason: string;
  candidates: MatchCandidate[];
}

const MATCH_THRESHOLD = 60;
const REVIEW_THRESHOLD = 35;
const AMBIGUITY_MARGIN = 10;

function norm(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function domainOf(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : "";
}

/** "Acme, Inc." -> "acme"; "acme.com" -> "acme". */
function companyKey(nameOrDomain: string): string {
  return norm(nameOrDomain)
    .replace(/\b(inc|llc|ltd|corp|corporation|company|co|technologies|labs)\b/g, " ")
    .replace(/\s+/g, "")
    .trim();
}

function stripSubjectPrefixes(subject: string): string {
  return subject.replace(/^(re|fwd?|aw|sv)\s*:\s*/i, "").trim();
}

function titleOverlapScore(jobTitle: string, text: string): number {
  const titleTokens = new Set(norm(jobTitle).split(" ").filter((t) => t.length > 2));
  if (titleTokens.size === 0) return 0;
  const hay = ` ${norm(text)} `;
  let hits = 0;
  for (const token of titleTokens) {
    if (hay.includes(` ${token} `)) hits += 1;
  }
  return hits / titleTokens.size;
}

export async function matchEmailToApplication(
  userId: string,
  email: NormalizedEmail,
): Promise<EmailMatchOutcome> {
  const applications = await prisma.application.findMany({
    where: { userId },
    include: { job: { select: { id: true, title: true, companyName: true } } },
    take: 500,
  });
  if (applications.length === 0) {
    return { applicationId: null, status: "UNMATCHED", score: 0, reason: "no applications to match against", candidates: [] };
  }

  const senderDomain = domainOf(email.fromEmail);
  const senderKey = companyKey(senderDomain.split(".")[0] ?? "");
  const subject = stripSubjectPrefixes(email.subject);
  const haystack = `${subject}\n${email.snippet}\n${email.bodyText}`;

  // Sender history: a sender already linked to an application is strong evidence.
  const linkedSenders = await prisma.emailMessage.findMany({
    where: { userId, fromEmail: email.fromEmail, applicationId: { not: null } },
    select: { applicationId: true },
    take: 20,
  });
  const historyApps = new Set(linkedSenders.map((e) => e.applicationId as string));

  const candidates: MatchCandidate[] = [];
  for (const app of applications) {
    let score = 0;
    const reasons: string[] = [];
    const key = companyKey(app.job.companyName);

    if (historyApps.has(app.id)) {
      score += 40;
      reasons.push("sender previously linked to this application");
    }
    if (senderKey && key && (senderKey === key || senderKey.includes(key) || key.includes(senderKey))) {
      score += 50;
      reasons.push(`sender domain matches company (${app.job.companyName})`);
    } else if (key && norm(`${email.fromName ?? ""} ${email.fromEmail}`).includes(key)) {
      score += 30;
      reasons.push(`sender identity mentions company (${app.job.companyName})`);
    }
    const overlap = titleOverlapScore(app.job.title, haystack);
    if (overlap >= 0.6) {
      score += 40;
      reasons.push(`job title strongly mentioned ("${app.job.title}")`);
    } else if (overlap >= 0.3) {
      score += 20;
      reasons.push(`job title partially mentioned ("${app.job.title}")`);
    }
    if (score > 0) {
      candidates.push({
        applicationId: app.id,
        jobTitle: app.job.title,
        companyName: app.job.companyName,
        score: Math.min(100, score),
        reason: reasons.join("; "),
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const shown = candidates.slice(0, 3);
  const top = candidates[0];
  if (!top || top.score < REVIEW_THRESHOLD) {
    return {
      applicationId: null,
      status: "UNMATCHED",
      score: top?.score ?? 0,
      reason: top ? `best candidate below review threshold (${top.score})` : "no candidate matched any signal",
      candidates: shown,
    };
  }
  const runnerUp = candidates[1];
  if (top.score < MATCH_THRESHOLD || (runnerUp && top.score - runnerUp.score < AMBIGUITY_MARGIN)) {
    return {
      applicationId: null,
      status: "NEEDS_REVIEW",
      score: top.score,
      reason:
        top.score < MATCH_THRESHOLD
          ? `best candidate below auto-attach threshold (${top.score})`
          : `ambiguous: top candidates within ${AMBIGUITY_MARGIN} points`,
      candidates: shown,
    };
  }
  return {
    applicationId: top.applicationId,
    status: "MATCHED",
    score: top.score,
    reason: top.reason,
    candidates: shown,
  };
}
