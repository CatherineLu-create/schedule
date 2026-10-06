import React from "react";
import type { ProjectMilestoneFollowUpGroup } from "./application/selectors/projectMilestoneFollowUp";
import type { ProjectId } from "./domain/shared/ids";

export interface ProjectMilestoneFollowUpPanelProps {
  readonly groups: readonly ProjectMilestoneFollowUpGroup[];
  readonly onOpenProject: (projectId: ProjectId) => void;
}

export function ProjectMilestoneFollowUpPanel({ groups, onOpenProject }: ProjectMilestoneFollowUpPanelProps): React.ReactElement | null {
  const headingId = React.useId();
  if (groups.length === 0) return null;
  return <section aria-labelledby={headingId} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
    <h2 id={headingId} className="text-base font-semibold text-slate-900">Milestone Follow-up</h2>
    <ul className="mt-3 space-y-3">
      {groups.map(group => <li key={group.projectId} className="min-w-0 break-words text-sm">
        <button type="button" aria-label={`Open Project ${group.projectName}`} onClick={() => onOpenProject(group.projectId)}
          className="max-w-full text-left font-semibold text-slate-900 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600">
          {group.projectName}
        </button>
        <p className="mt-1 text-xs text-slate-500">QCI PM: {group.qciPmDisplay}</p>
        <p className="mt-1 text-slate-700">Pending: {group.pendingDefinitions.map(definition => definition.displayName).join(", ")}</p>
      </li>)}
    </ul>
  </section>;
}
