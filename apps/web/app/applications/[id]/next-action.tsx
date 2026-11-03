"use client";

import Link from "next/link";
import { Card, Badge } from "../../../components/ui";
import type { ApplicationRun, PersonalizationDraft } from "../../../lib/api";

/**
 * Phase 18 — application action center. Derives the single most useful next
 * step from the existing Phase 7/8 run state machine, the personalization
 * lifecycle, and the application status. Advisory links only: it never
 * triggers submissions, emails, or automation by itself.
 */

export interface NextAction {
  title: string;
  detail: string;
  href: string;
  badge: string;
}

export function computeNextAction(
  applicationId: string,
  appStatus: string,
  drafts: PersonalizationDraft[],
  runs: ApplicationRun[],
): NextAction | null {
  const latest = runs.length > 0 ? runs[0] : null;

  if (latest) {
    if (latest.sessionStatus === "WAITING_FOR_LOGIN" || latest.errorCode === "LOGIN_REQUIRED") {
      return {
        title: "Continue manually — login required",
        detail: "The site needs you to sign in. JobPilot never handles your password.",
        href: `/applications/${applicationId}`,
        badge: "MANUAL LOGIN",
      };
    }
    if (latest.errorCode === "CAPTCHA_DETECTED" || latest.errorCode === "ACCESS_DENIED") {
      return {
        title: "Manual intervention required",
        detail: "The site presents a verification challenge or denied access. Nothing was bypassed.",
        href: `/applications/${applicationId}`,
        badge: "BLOCKED",
      };
    }
    if (latest.errorCode === "SUBMISSION_STATUS_UNKNOWN") {
      return {
        title: "Verify the submission manually",
        detail: "JobPilot could not confirm the outcome. Check the site, then resolve below.",
        href: `/applications/${applicationId}`,
        badge: "VERIFY",
      };
    }
    switch (latest.status) {
      case "WAITING_FOR_REVIEW":
        return {
          title: "Review fields",
          detail: "The assistant proposed answers. Review and approve them below.",
          href: `/applications/${applicationId}`,
          badge: "REVIEW",
        };
      case "READY_TO_FILL":
        return {
          title: "Review before filling",
          detail: "Answers are approved. Fill them into the form when ready.",
          href: `/applications/${applicationId}`,
          badge: "FILL",
        };
      case "WAITING_FOR_SUBMISSION":
        return {
          title: "Confirm submission",
          detail: "The form is filled. Review it, then confirm — only you can submit.",
          href: `/applications/${applicationId}`,
          badge: "CONFIRM",
        };
      case "SUBMITTED":
        return null; // Tracking/timeline take over; no action banner.
      default:
        break;
    }
  }

  const awaitingReview = drafts.some((d) => d.status === "REVIEW_REQUIRED");
  if (awaitingReview) {
    return {
      title: "Review personalization",
      detail: "A draft is waiting for your review. Approval never submits anything.",
      href: `/applications/${applicationId}#personalization`,
      badge: "REVIEW DRAFT",
    };
  }
  const approved = drafts.some((d) => d.status === "APPROVED");
  if (approved && !latest) {
    return {
      title: "Prepare application",
      detail: "Approved content is ready to feed the application assistant.",
      href: `/applications/${applicationId}`,
      badge: "PREPARE",
    };
  }
  if (!latest && drafts.length === 0 && ["DISCOVERED", "SAVED", "APPLIED"].includes(appStatus)) {
    return {
      title: "Generate personalization",
      detail: "Create a fact-grounded draft from your profile, resume, and projects.",
      href: `/applications/${applicationId}#personalization`,
      badge: "PERSONALIZE",
    };
  }
  return null;
}

export default function NextActionBanner({ action }: { action: NextAction | null }) {
  if (!action) return null;
  return (
    <Card className="mb-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Next step</h2>
        <Badge>{action.badge}</Badge>
      </div>
      <p className="mt-1 font-medium">{action.title}</p>
      <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>{action.detail}</p>
      <Link
        href={action.href}
        className="mt-2 inline-block rounded-lg bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
      >
        Continue →
      </Link>
    </Card>
  );
}
