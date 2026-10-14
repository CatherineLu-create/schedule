import type { Project } from "../../domain/project/project";
import type { ProjectId } from "../../domain/shared/ids";

/** Current STN-name matching only; intentionally independent of historical aliases. */
export function normalizeStnProjectName(value: string | null): string {
  return (value ?? "").trim().toLowerCase();
}
export function findSameNameProjects(projects: readonly Project[], name: string | null, excludeProjectId?: ProjectId): readonly Project[] {
  const normalized = normalizeStnProjectName(name);
  return normalized === "" ? [] : projects.filter(project => project.id !== excludeProjectId
    && normalizeStnProjectName(project.master.basicInformation.stnProjectName) === normalized);
}
