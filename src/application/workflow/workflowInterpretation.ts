import {
	createProject,
	type CreateProjectContext,
	type CreateProjectInput,
	type CreateProjectResult,
} from "../commands/projectCommands";
import type {
	PublishProjectScheduleResult,
	ReplaceProjectScheduleWorkingDraftResult,
} from "../commands/scheduleCommands";
import type { SaveProjectTeamResult } from "../commands/teamCommands";
import type { Project } from "../../domain/project/project";
import type {
	ProjectId,
	ScheduleDraftId,
} from "../../domain/shared/ids";
import type { ValidationIssue } from "../../domain/validation/validationIssue";

export type ActionDispositionKind = "completed" | "blocked" | "rejected";

export interface ActionDisposition<
	TKind extends ActionDispositionKind,
	TResult,
> {
	readonly kind: TKind;
	readonly result: TResult;
}

export type WorkflowActionDirection = "backward" | "forward";

export interface WorkflowDecisionAction<
	TId extends string,
	TDirection extends WorkflowActionDirection,
> {
	readonly id: TId;
	readonly direction: TDirection;
}

type CreatedProjectResult = Extract<CreateProjectResult, { status: "created" }>;
type RejectedCreateProjectResult = Extract<
	CreateProjectResult,
	{ status: "rejected" }
>;
type ReviewRequiredCreateProjectResult = Extract<
	CreateProjectResult,
	{ status: "reviewRequired" }
>;

export interface DuplicateProjectDecisionRequest {
	readonly kind: "duplicateProject";
	readonly matchingProjectIds: readonly ProjectId[];
	readonly issues: readonly ValidationIssue[];
	readonly actions: readonly [
		WorkflowDecisionAction<"reviewExisting", "backward">,
		WorkflowDecisionAction<"createAnyway", "forward">,
	];
}

export interface ReplaceWorkingDraftDecisionRequest {
	readonly kind: "replaceWorkingDraft";
	readonly projectId: ProjectId;
	readonly workingDraftId: ScheduleDraftId;
	readonly actions: readonly [
		WorkflowDecisionAction<"cancel", "backward">,
		WorkflowDecisionAction<"replaceAndImport", "forward">,
	];
}

export interface DiscardUnsavedChangesDecisionRequest {
	readonly kind: "discardUnsavedChanges";
	readonly actions: readonly [
		WorkflowDecisionAction<"stay", "backward">,
		WorkflowDecisionAction<"discardAndLeave", "forward">,
	];
}

export type WorkflowDecisionRequest =
	| DuplicateProjectDecisionRequest
	| ReplaceWorkingDraftDecisionRequest
	| DiscardUnsavedChangesDecisionRequest;

export type CreateProjectInterpretation =
	| ActionDisposition<"completed", CreatedProjectResult>
	| ActionDisposition<"rejected", RejectedCreateProjectResult>
	| DuplicateProjectDecisionRequest;

export function interpretCreateProjectResult(
	result: CreateProjectResult,
): CreateProjectInterpretation {
	if (result.status === "reviewRequired") {
		return {
			kind: "duplicateProject",
			matchingProjectIds: result.matchingProjectIds,
			issues: result.issues,
			actions: [
				{ id: "reviewExisting", direction: "backward" },
				{ id: "createAnyway", direction: "forward" },
			],
		};
	}

	return result.status === "created"
		? { kind: "completed", result }
		: { kind: "rejected", result };
}

export function confirmCreateProjectAnyway(
	input: CreateProjectInput,
	context: CreateProjectContext,
): CreateProjectInterpretation {
	return interpretCreateProjectResult(
		createProject(input, {
			...context,
			allowBusinessIdentityDuplicate: true,
		}),
	);
}

export type PublishProjectScheduleDisposition = ActionDisposition<
	ActionDispositionKind,
	PublishProjectScheduleResult
>;

export function interpretPublishProjectScheduleResult(
	result: PublishProjectScheduleResult,
): PublishProjectScheduleDisposition {
	if (result.ok) {
		return { kind: "completed", result };
	}

	return result.reason === "validation"
		? { kind: "blocked", result }
		: { kind: "rejected", result };
}

export type SaveProjectTeamDisposition = ActionDisposition<
	"completed" | "blocked",
	SaveProjectTeamResult
>;

export function interpretSaveProjectTeamResult(
	result: SaveProjectTeamResult,
): SaveProjectTeamDisposition {
	return result.ok
		? { kind: "completed", result }
		: { kind: "blocked", result };
}

export function requestReplaceWorkingDraftDecision(
	project: Project,
): ReplaceWorkingDraftDecisionRequest | null {
	const draft = project.schedule.workingDraft;

	if (draft === null) {
		return null;
	}

	return {
		kind: "replaceWorkingDraft",
		projectId: project.id,
		workingDraftId: draft.id,
		actions: [
			{ id: "cancel", direction: "backward" },
			{ id: "replaceAndImport", direction: "forward" },
		],
	};
}

export type ReplaceWorkingDraftDisposition = ActionDisposition<
	"completed" | "rejected",
	ReplaceProjectScheduleWorkingDraftResult
>;

export function interpretReplaceWorkingDraftResult(
	result: ReplaceProjectScheduleWorkingDraftResult,
): ReplaceWorkingDraftDisposition {
	return result.ok
		? { kind: "completed", result }
		: { kind: "rejected", result };
}

export function requestUnsavedNavigationDecision(
	navigationWouldDiscardUnsavedChanges: boolean,
): DiscardUnsavedChangesDecisionRequest | null {
	if (!navigationWouldDiscardUnsavedChanges) {
		return null;
	}

	return {
		kind: "discardUnsavedChanges",
		actions: [
			{ id: "stay", direction: "backward" },
			{ id: "discardAndLeave", direction: "forward" },
		],
	};
}
