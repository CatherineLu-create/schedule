export type ValidationIssueCode = string;
export type ValidationDomain = "projectMaster" | "schedule" | "team";
export type ValidationSource = "import" | "data";
export type ValidationSeverity = "blocking" | "advisory";

export interface ValidationTarget {
  readonly section: string;
  readonly entityId?: string;
  readonly field?: string;
}

export interface ValidationIssue {
  readonly code: ValidationIssueCode;
  readonly domain: ValidationDomain;
  readonly source: ValidationSource;
  readonly severity: ValidationSeverity;
  readonly message: string;
  readonly target: ValidationTarget;
}

export function isBlocking(issue: ValidationIssue): boolean {
  return issue.severity === "blocking";
}

export function countBlocking(issues: readonly ValidationIssue[]): number {
  return issues.filter(isBlocking).length;
}

export function filterIssuesByDomain(
  issues: readonly ValidationIssue[],
  domain: ValidationDomain,
): ValidationIssue[] {
  return issues.filter((issue) => issue.domain === domain);
}
