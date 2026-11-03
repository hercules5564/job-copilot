import type {
  EmailClassification,
  EmailClassificationResult,
  NormalizedEmail,
} from "@jobcopilot/shared";

/**
 * Phase 6 — deterministic email classification (no LLM, no embeddings).
 * Rule-based signals over sender/subject/body with explainable reasons.
 * The score is a rule-evidence tally (0–100), NOT AI confidence.
 * Minimum evidence (2 signals) is required for job classes; otherwise
 * UNKNOWN. Ties resolve in a fixed priority order (documented below).
 */

const ATS_DOMAINS = [
  "greenhouse.io",
  "lever.co",
  "workday",
  "taleo.net",
  "icims.com",
  "ashbyhq.com",
  "workable.com",
  "smartrecruiters.com",
  "jobvite.com",
];

const RECRUITING_SENDERS = [
  "talent",
  "careers",
  "jobs",
  "recruiting",
  "recruiter",
  "hiring",
  "hr@",
  "people@",
  "noreply",
  "no-reply",
  "donotreply",
];

function domainOf(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : "";
}

function has(haystack: string, ...terms: string[]): string | null {
  for (const term of terms) {
    if (haystack.includes(term)) return term;
  }
  return null;
}

interface RuleHit {
  classification: EmailClassification;
  reason: string;
  points: number;
}

function rulesFor(email: NormalizedEmail): RuleHit[] {
  const hay = `${email.subject}\n${email.snippet}\n${email.bodyText}`.toLowerCase();
  const from = email.fromEmail.toLowerCase();
  const domain = domainOf(from);
  const hits: RuleHit[] = [];
  const add = (classification: EmailClassification, reason: string, points: number) => {
    hits.push({ classification, reason, points });
  };

  // Structural: applicant-tracking / recruiting senders.
  if (ATS_DOMAINS.some((d) => domain.includes(d))) {
    add("APPLICATION_UPDATE", `sent from applicant-tracking domain ${domain}`, 20);
  }
  const senderHit = RECRUITING_SENDERS.find((s) => from.includes(s));
  if (senderHit) {
    add("APPLICATION_UPDATE", `sent from recruiting-style address (${senderHit})`, 15);
  }

  // Rejection.
  const rej = has(
    hay,
    "not moving forward",
    "not be moving forward",
    "decided to pursue other",
    "regret to inform",
    "unfortunately",
    "unsuccessful application",
    "position has been filled",
    "will not be proceeding",
  );
  if (rej) add("REJECTION", `contains rejection language ("${rej}")`, 30);

  // Offer.
  const offer = has(hay, "offer letter", "job offer", "pleased to offer", "compensation package");
  if (offer) add("OFFER", `contains offer language ("${offer}")`, 35);

  // Interview: scheduled vs invitation.
  const interviewTerm = has(hay, "interview", "phone screen", "onsite", "on-site", "video call interview");
  const scheduleTerm = has(
    hay,
    "calendly",
    "pick a time",
    "pick a slot",
    "your availability",
    "available slots",
    "meeting invite",
    "calendar invite",
    "scheduled for",
    "confirmed for",
  );
  const inviteTerm = has(
    hay,
    "would like to invite",
    "invite you to interview",
    "like to speak with you",
    "like to chat",
    "next step",
    "next steps",
  );
  if (interviewTerm && scheduleTerm) {
    add("INTERVIEW_SCHEDULE", `interview term ("${interviewTerm}") with scheduling language ("${scheduleTerm}")`, 35);
  } else if (interviewTerm && inviteTerm) {
    add("INTERVIEW_INVITATION", `interview term ("${interviewTerm}") with invitation language ("${inviteTerm}")`, 35);
  } else if (interviewTerm && senderHit) {
    add("INTERVIEW_INVITATION", `interview term ("${interviewTerm}") from recruiting sender`, 25);
  }

  // Assessment.
  const assess = has(
    hay,
    "coding challenge",
    "take-home",
    "take home assignment",
    "hackerrank",
    "codility",
    "online assessment",
    "technical assessment",
    "home assignment",
  );
  if (assess) add("ASSESSMENT", `contains assessment language ("${assess}")`, 35);

  // Application confirmation.
  const confirm = has(
    hay,
    "thank you for applying",
    "thanks for applying",
    "application received",
    "we received your application",
    "confirming receipt",
    "successfully applied",
    "your application to",
  );
  if (confirm) add("APPLICATION_CONFIRMATION", `contains confirmation language ("${confirm}")`, 35);

  // Application update (generic progress).
  const update = has(
    hay,
    "application status",
    "status of your application",
    "under review",
    "being reviewed",
    "moved to the next stage",
  );
  if (update) add("APPLICATION_UPDATE", `contains status-update language ("${update}")`, 30);

  // Recruiter outreach.
  const outreach = has(
    hay,
    "came across your profile",
    "impressed by your background",
    "relevant opportunity",
    "open to a conversation",
    "would love to connect",
    "reaching out regarding",
  );
  if (outreach) add("RECRUITER_OUTREACH", `contains outreach language ("${outreach}")`, 30);

  // Follow-up.
  const followup = has(hay, "following up", "follow-up", "checking in on", "just checking in", "circling back");
  if (followup && (senderHit || outreach)) {
    add("FOLLOW_UP", `follow-up language ("${followup}") with recruiting context`, 25);
  }

  // Newsletter / promo.
  const promo = has(hay, "unsubscribe", "newsletter", "view in browser", "email preferences", "marketing email");
  if (promo) add("NEWSLETTER", `contains bulk-mail marker ("${promo}")`, 40);

  return hits;
}

/** Fixed tie-break priority: most consequential first. */
const PRIORITY: EmailClassification[] = [
  "OFFER",
  "REJECTION",
  "INTERVIEW_SCHEDULE",
  "INTERVIEW_INVITATION",
  "ASSESSMENT",
  "APPLICATION_CONFIRMATION",
  "APPLICATION_UPDATE",
  "RECRUITER_OUTREACH",
  "FOLLOW_UP",
  "NEWSLETTER",
  "IRRELEVANT",
  "UNKNOWN",
];

/**
 * Minimum evidence for a job class: one strong content signal (30–35 pts)
 * or two weak structural signals. A lone weak signal (e.g. only a
 * recruiting-style sender at 15–20 pts) stays UNKNOWN.
 */
const MIN_JOB_CLASS_SCORE = 30;

export function classifyEmail(email: NormalizedEmail): EmailClassificationResult {
  const hits = rulesFor(email);
  const totals = new Map<EmailClassification, { score: number; reasons: string[] }>();
  for (const hit of hits) {
    const entry = totals.get(hit.classification) ?? { score: 0, reasons: [] };
    entry.score = Math.min(100, entry.score + hit.points);
    entry.reasons.push(hit.reason);
    totals.set(hit.classification, entry);
  }
  const ranked = [...totals.entries()]
    .filter(([, v]) => v.score > 0)
    .sort((a, b) => b[1].score - a[1].score || PRIORITY.indexOf(a[0]) - PRIORITY.indexOf(b[0]));
  if (ranked.length === 0) {
    return { classification: "UNKNOWN", classificationScore: 0, reasons: ["no recognizable signals"] };
  }
  const [winner, data] = ranked[0];
  const isBulk = winner === "NEWSLETTER";
  if (!isBulk && data.score < MIN_JOB_CLASS_SCORE) {
    return {
      classification: "UNKNOWN",
      classificationScore: data.score,
      reasons: [...data.reasons, "insufficient evidence for a job class (below minimum score)"],
    };
  }
  return { classification: winner, classificationScore: data.score, reasons: data.reasons };
}
