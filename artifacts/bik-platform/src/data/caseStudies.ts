export interface CaseStudy {
  sector: string;
  beforeAfter: string;
  months: number;
  note: string;
}

/** Publish only an actual, reviewed case; no invented examples or inferred outcomes. */
export const caseStudies: readonly CaseStudy[] = [];
