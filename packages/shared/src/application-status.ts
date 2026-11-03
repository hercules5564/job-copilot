import { z } from "zod";

/** Application lifecycle — single source of truth shared by API + web. */
export const ApplicationStatus = {
  DISCOVERED: "DISCOVERED",
  MATCHED: "MATCHED",
  REVIEW: "REVIEW",
  READY: "READY",
  APPROVED: "APPROVED",
  APPLIED: "APPLIED",
  ASSESSMENT: "ASSESSMENT",
  RECRUITER_RESPONSE: "RECRUITER_RESPONSE",
  INTERVIEW: "INTERVIEW",
  OFFER: "OFFER",
  REJECTED: "REJECTED",
  WITHDRAWN: "WITHDRAWN",
  ARCHIVED: "ARCHIVED",
} as const;
export type ApplicationStatus =
  (typeof ApplicationStatus)[keyof typeof ApplicationStatus];

export const ApplicationStatusSchema = z.nativeEnum(ApplicationStatus);

/** Allowed forward transitions (UI guardrail; server re-validates). */
export const AllowedTransitions: Record<ApplicationStatus, ApplicationStatus[]> =
  {
    DISCOVERED: ["MATCHED", "ARCHIVED"],
    MATCHED: ["REVIEW", "ARCHIVED"],
    REVIEW: ["READY", "WITHDRAWN", "ARCHIVED"],
    READY: ["APPROVED", "REVIEW", "WITHDRAWN"],
    APPROVED: ["APPLIED", "WITHDRAWN"],
    APPLIED: ["ASSESSMENT", "RECRUITER_RESPONSE", "INTERVIEW", "OFFER", "REJECTED", "WITHDRAWN"],
    ASSESSMENT: ["INTERVIEW", "REJECTED", "OFFER", "WITHDRAWN"],
    RECRUITER_RESPONSE: ["INTERVIEW", "ASSESSMENT", "REJECTED", "OFFER"],
    INTERVIEW: ["OFFER", "REJECTED", "WITHDRAWN"],
    OFFER: ["ARCHIVED", "WITHDRAWN"],
    REJECTED: ["ARCHIVED"],
    WITHDRAWN: ["ARCHIVED"],
    ARCHIVED: [],
  };

export function canTransition(
  from: ApplicationStatus,
  to: ApplicationStatus,
): boolean {
  return AllowedTransitions[from]?.includes(to) ?? false;
}
