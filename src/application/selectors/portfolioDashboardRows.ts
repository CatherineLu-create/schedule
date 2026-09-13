import { portfolioMilestoneDefinitions } from "../../config/v2/referenceData";
import type { CatalogItem } from "../../domain/reference-data/catalog";
import type { MilestoneApplicability } from "../../domain/schedule/schedule";
import { formatDateOnly, type DateOnly } from "../../domain/shared/dateOnly";
import type { CatalogItemId, MilestoneDefinitionId, MilestoneId, ProjectId } from "../../domain/shared/ids";
import type { ValidationIssue } from "../../domain/validation/validationIssue";
import { categoryReferenceFixtures } from "../../fixtures/v2/referenceFixtures";
import type { PrototypeState } from "../state/prototypeState";
import { getProjectById } from "./projectSelectors";
import { selectDashboardProjectRows, type DashboardProjectRow } from "./dashboardProjectRows";
import { selectCurrentPublishedSchedule } from "./scheduleSelectors";

export interface PortfolioScheduleMilestoneOccurrence {
  readonly milestoneId: MilestoneId;
  readonly applicability: MilestoneApplicability;
  readonly plan: string;
  readonly actual: string;
}

export interface PortfolioScheduleMilestoneCell {
  readonly milestoneDefinitionId: MilestoneDefinitionId;
  readonly occurrences: readonly PortfolioScheduleMilestoneOccurrence[];
}

export type PortfolioCurrentPublishedRead =
  | { readonly kind: "unavailable"; readonly issues: readonly ValidationIssue[] }
  | { readonly kind: "noPublishedSchedule" }
  | { readonly kind: "published"; readonly versionLabel: string; readonly milestoneCount: number; readonly cells: readonly PortfolioScheduleMilestoneCell[] };

export interface PortfolioDashboardRow {
  readonly projectId: ProjectId;
  readonly project: DashboardProjectRow;
  readonly category: string;
  readonly pcbNumber: string;
  readonly schedule: PortfolioCurrentPublishedRead;
}

const EMPTY_DISPLAY = "-";

function displayText(value: string | null): string {
  return value === null || value.trim().length === 0 ? EMPTY_DISPLAY : value;
}

function displayDate(value: DateOnly | null): string {
  return value === null ? EMPTY_DISPLAY : formatDateOnly(value);
}

function resolveCategory(categoryId: CatalogItemId | null): string {
  if (categoryId === null) return EMPTY_DISPLAY;
  return categoryReferenceFixtures.find((item: CatalogItem<CatalogItemId>) => item.id === categoryId)?.displayName ?? EMPTY_DISPLAY;
}

export function selectPortfolioDashboardRows(
  state: PrototypeState,
): readonly PortfolioDashboardRow[] {
  return selectDashboardProjectRows(state).map((projectRow) => {
    const project = getProjectById(state, projectRow.projectId);
    if (project === null) {
      throw new Error(`Dashboard row Project is absent: ${projectRow.projectId}`);
    }

    const currentPublished = selectCurrentPublishedSchedule(state, projectRow.projectId);
    const schedule: PortfolioCurrentPublishedRead = currentPublished.kind === "unavailable"
      ? { kind: "unavailable", issues: currentPublished.issues }
      : currentPublished.kind === "noPublishedSchedule"
        ? { kind: "noPublishedSchedule" }
        : {
            kind: "published",
            versionLabel: currentPublished.versionLabel,
            milestoneCount: currentPublished.version.milestones.length,
            cells: portfolioMilestoneDefinitions.map((definition) => ({
              milestoneDefinitionId: definition.id,
              occurrences: currentPublished.version.milestones
                .filter((milestone) => milestone.milestoneDefinitionId === definition.id)
                .map((milestone) => ({
                  milestoneId: milestone.milestoneId,
                  applicability: milestone.applicability,
                  plan: displayDate(milestone.plan),
                  actual: displayDate(milestone.actual),
                })),
            })),
          };

    return {
      projectId: projectRow.projectId,
      project: projectRow,
      category: resolveCategory(project.master.basicInformation.category),
      pcbNumber: displayText(project.master.platformHardware.pcbNumber),
      schedule,
    };
  });
}
