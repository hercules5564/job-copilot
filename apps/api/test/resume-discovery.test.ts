/**
 * Phase 22 — resume/portfolio-based job discovery.
 * Requires PostgreSQL (DATABASE_URL). Uses the dev-auth bypass header.
 * Isolation: users p22test-*; uploaded files are removed in afterAll.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { prisma } from "@jobcopilot/db";
import { createApp } from "../src/app.js";
import { deleteDocument } from "../src/services/resume-storage.js";

const DB = Boolean(process.env.DATABASE_URL);
const TS = Date.now();
const USER_A = `p22test-a-${TS}`;
const USER_B = `p22test-b-${TS}`;
const HA = { "x-dev-user-id": USER_A };
const HB = { "x-dev-user-id": USER_B };

const app = createApp();

const RESUME_LINES = [
  "Jane Candidate",
  "Software Engineer",
  "Location: Bengaluru, India",
  "Summary",
  "Backend engineer with 5 years of experience building APIs.",
  "Skills",
  "TypeScript, React, Node.js, PostgreSQL, AWS, Docker",
  "Experience",
  "Acme Corp - Software Engineer",
  "- Built REST APIs with Node.js",
  "Education",
  "BSc Computer Science, State University",
  "Projects",
  "Portfolio Site",
  "- Built with React and Node.js",
];

function makePdf(lines: string[]): Buffer {
  const content = [
    "BT",
    "/F1 12 Tf",
    "72 720 Td",
    ...lines.flatMap((line, i) => [
      i === 0 ? "" : "0 -18 Td",
      `(${line.replace(/[()\\]/g, "\\$&")}) Tj`,
    ]),
    "ET",
  ]
    .filter(Boolean)
    .join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let k = 0; k < 8; k += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(files: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const crc = crc32(file.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(file.data.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, file.data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(file.data.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + file.data.length;
  }
  const centralSize = centrals.reduce((sum, b) => sum + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

function makeDocx(lines: string[]): Buffer {
  const paragraphs = lines
    .map((line) => `<w:p><w:r><w:t>${line.replace(/[<>&]/g, "")}</w:t></w:r></w:p>`)
    .join("");
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}</w:body></w:document>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  return zip([
    { name: "[Content_Types].xml", data: Buffer.from(contentTypes) },
    { name: "_rels/.rels", data: Buffer.from(rels) },
    { name: "word/document.xml", data: Buffer.from(document) },
  ]);
}

let resumeId = "";
let docxResumeId = "";
let jobId = "";

beforeAll(async () => {
  if (!DB) return;
  const upload = await request(app)
    .post("/api/resumes/upload")
    .set(HA)
    .set("Content-Type", "application/pdf")
    .set("x-file-name", "resume.pdf")
    .set("x-resume-kind", "RESUME")
    .set("x-resume-name", "Primary Resume")
    .send(makePdf(RESUME_LINES));
  resumeId = upload.body.resume?.id ?? "";

  const job = await request(app).post("/api/jobs").set(HA).send({
    title: "Software Engineer",
    company: "Acme",
    location: "Remote",
    remote: true,
    employmentType: "Full-time",
    description:
      "We are hiring a Software Engineer with 3+ years experience. Required: TypeScript, React, Node.js, PostgreSQL, AWS. Bachelor's degree in Computer Science.",
  });
  jobId = job.body.job?.id ?? "";
});

afterAll(async () => {
  if (!DB) return;
  const rows = await prisma.resume.findMany({
    where: { userId: { in: [USER_A, USER_B] } },
    select: { storageKey: true },
  });
  for (const row of rows) await deleteDocument(row.storageKey);
  await prisma.user.deleteMany({ where: { id: { in: [USER_A, USER_B] } } });
  await prisma.$disconnect();
});

describe.skipIf(!DB)("resume upload and extraction", () => {
  it("uploads a PDF, extracts facts, and keeps the file private", async () => {
    expect(resumeId).toBeTruthy();
    const res = await request(app).get(`/api/resumes/${resumeId}`).set(HA).expect(200);
    expect(res.body.resume.status).toBe("PARSED");
    expect(res.body.resume.storageKey).toBeTruthy();
    expect(res.body.resume.originalName).toBe("resume.pdf");

    const extraction = await request(app)
      .get(`/api/resumes/${resumeId}/extraction`)
      .set(HA)
      .expect(200);
    const data = extraction.body.extraction;
    expect(data.yearsOfExperience).toBe(5);
    expect(data.location).toBe("Bengaluru, India");
    expect(data.education.join(" ")).toContain("BSc Computer Science");
    expect(data.skills.map((s: { name: string }) => s.name)).toEqual(
      expect.arrayContaining(["TypeScript", "React", "Node.js", "PostgreSQL", "AWS", "Docker"]),
    );
    expect(data.projects.some((p: { name: string }) => p.name === "Portfolio Site")).toBe(true);

    const download = await request(app).get(`/api/resumes/${resumeId}/download`).set(HA).expect(200);
    expect(download.headers["content-type"]).toContain("application/pdf");
    expect(download.headers["cache-control"]).toContain("no-store");

    // A different user cannot read or download the document.
    await request(app).get(`/api/resumes/${resumeId}`).set(HB).expect(404);
    await request(app).get(`/api/resumes/${resumeId}/download`).set(HB).expect(404);
  });

  it("uploads and parses a DOCX resume", async () => {
    const res = await request(app)
      .post("/api/resumes/upload")
      .set(HA)
      .set("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
      .set("x-file-name", "resume.docx")
      .set("x-resume-kind", "RESUME")
      .send(makeDocx(RESUME_LINES));
    expect(res.status).toBe(201);
    expect(res.body.resume.status).toBe("PARSED");
    expect(res.body.resume.mimeType).toContain("wordprocessingml");
    expect(res.body.resume.parsedText).toContain("Jane Candidate");
    docxResumeId = res.body.resume.id;
  });

  it("rejects unsupported and oversized uploads", async () => {
    const text = await request(app)
      .post("/api/resumes/upload")
      .set(HA)
      .set("Content-Type", "text/plain")
      .send(Buffer.from("not a resume"));
    expect([400, 415, 422]).toContain(text.status);

    const oversized = Buffer.alloc(11 * 1024 * 1024);
    oversized.write("%PDF-", 0, "latin1");
    const big = await request(app)
      .post("/api/resumes/upload")
      .set(HA)
      .set("Content-Type", "application/pdf")
      .set("x-file-name", "big.pdf")
      .send(oversized);
    expect(big.status).toBe(413);
  });

  it("confirms user-corrected extraction into the profile", async () => {
    const extraction = await request(app)
      .get(`/api/resumes/${resumeId}/extraction`)
      .set(HA)
      .expect(200);
    const corrected = {
      ...extraction.body.extraction,
      summary: "Corrected summary.",
      targetRoles: ["Backend Engineer"],
      preferredLocations: ["Bengaluru", "Remote"],
      workMode: "REMOTE",
      experienceLevel: "MID",
    };
    const confirm = await request(app)
      .put(`/api/resumes/${resumeId}/extraction`)
      .set(HA)
      .send({
        extraction: corrected,
        githubUrl: "https://github.com/octocat",
        setActive: true,
      });
    expect(confirm.status).toBe(200);
    expect(confirm.body.profile.summary).toBe("Corrected summary.");
    expect(confirm.body.profile.targetRoles).toEqual(["Backend Engineer"]);
    expect(confirm.body.profile.workMode).toBe("REMOTE");
    expect(confirm.body.profile.githubUrl).toBe("https://github.com/octocat");
    expect(confirm.body.projects.some((p: { name: string }) => p.name === "Portfolio Site")).toBe(true);
  });

  it("runs matching and returns explainable recommendations", async () => {
    const run = await request(app)
      .post("/api/recommendations/run")
      .set(HA)
      .send({ limit: 10 });
    expect(run.status).toBe(200);
    expect(run.body.matched).toBeGreaterThanOrEqual(1);

    const list = await request(app)
      .get("/api/recommendations?sort=score&minScore=0&limit=10")
      .set(HA)
      .expect(200);
    expect(list.body.items.length).toBeGreaterThanOrEqual(1);
    const item = list.body.items[0];
    expect(item.matchScore).toBeGreaterThanOrEqual(0);
    expect(item.matchScore).toBeLessThanOrEqual(100);
    expect(item.reasons.length).toBeGreaterThan(0);
    expect(item.breakdown.skillScore).toBeGreaterThanOrEqual(0);

    const filtered = await request(app)
      .get("/api/recommendations?role=Software&workMode=REMOTE")
      .set(HA)
      .expect(200);
    expect(filtered.body.items.every((i: { title: string }) => i.title.includes("Software"))).toBe(true);

    const detail = await request(app)
      .get(`/api/recommendations/${jobId}`)
      .set(HA)
      .expect(200);
    expect(detail.body.recommendation.explanation.recommendations.length).toBeGreaterThan(0);
    expect(detail.body.recommendation.jobId).toBe(jobId);
  });

  it("saves and unsaves jobs, scoped to the owner", async () => {
    const save = await request(app).post("/api/saved-jobs").set(HA).send({ jobId });
    expect(save.status).toBe(201);

    const mine = await request(app).get("/api/saved-jobs").set(HA).expect(200);
    expect(mine.body.savedJobs.some((s: { jobId: string }) => s.jobId === jobId)).toBe(true);

    const foreign = await request(app).get("/api/saved-jobs").set(HB).expect(200);
    expect(foreign.body.savedJobs).toEqual([]);

    const unsave = await request(app).delete(`/api/saved-jobs/${jobId}`).set(HA);
    expect(unsave.status).toBe(200);
    await request(app).delete(`/api/saved-jobs/${jobId}`).set(HA).expect(404);
  });

  it("rejects private portfolio URLs instead of inventing projects", async () => {
    const res = await request(app)
      .post("/api/portfolio/analyze")
      .set(HA)
      .send({ url: "http://127.0.0.1:1234" });
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toMatch(/private/i);
  });

  it("isolates recommendations and resumes between users", async () => {
    const recs = await request(app).get("/api/recommendations").set(HB).expect(200);
    expect(recs.body.items).toEqual([]);
    const resumes = await request(app).get("/api/resumes").set(HB).expect(200);
    expect(resumes.body.resumes).toEqual([]);
  });

  it("deletes a resume and its stored file", async () => {
    await request(app).delete(`/api/resumes/${docxResumeId}`).set(HA).expect(200);
    await request(app).get(`/api/resumes/${docxResumeId}`).set(HA).expect(404);
    await request(app).get(`/api/resumes/${docxResumeId}/download`).set(HA).expect(404);
  });
});
