/**
 * Matching-engine contract (Phase 4 will implement scoring).
 * Phase 1 only defines the shape so API + web agree on types.
 * Scores are 0–100 internal prioritization signals, NOT objective truth.
 */
export interface MatchBreakdown {
  overallScore: number;
  skillScore: number;
  experienceScore: number;
  educationScore: number;
  projectScore: number;
  locationScore: number;
  salaryScore: number;
  employmentTypeScore: number;
  workAuthorizationScore: number;
  reasons: string[];
  missingRequirements: string[];
  riskFlags: string[];
  recommendedProjectIds: string[];
}

export function emptyMatch(): MatchBreakdown {
  return {
    overallScore: 0,
    skillScore: 0,
    experienceScore: 0,
    educationScore: 0,
    projectScore: 0,
    locationScore: 0,
    salaryScore: 0,
    employmentTypeScore: 0,
    workAuthorizationScore: 0,
    reasons: [],
    missingRequirements: [],
    riskFlags: [],
    recommendedProjectIds: [],
  };
}
