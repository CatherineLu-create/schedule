import React from "react";
import type { DashboardProjectRow } from "./application/selectors/dashboardProjectRows";
import type { DuplicateProjectDecisionRequest } from "./application/workflow/workflowInterpretation";
import type { ProjectId } from "./domain/shared/ids";

export interface DuplicateProjectReviewProps {
  readonly decision: DuplicateProjectDecisionRequest;
  readonly matchingRows: readonly DashboardProjectRow[];
  readonly onBackToForm: () => void;
  readonly onCreateAnyway: () => void;
  readonly onSelectProject: (projectId: ProjectId) => void;
}

export function DuplicateProjectReview({
  decision,
  matchingRows,
  onBackToForm,
  onCreateAnyway,
  onSelectProject,
}: DuplicateProjectReviewProps): React.ReactElement {
  const [showMatches, setShowMatches] = React.useState(false);

  const reviewExisting = () => {
    if (matchingRows.length === 1) {
      onSelectProject(matchingRows[0]!.projectId);
      return;
    }

    setShowMatches(true);
  };

  return (
    <section aria-label="Duplicate Project review" className="grid gap-4">
      <div>
        <h3 className="font-semibold">A Project with this business identity already exists.</h3>
        {decision.issues.map((issue) => (
          <div className="mt-1 text-sm text-amber-800" key={`${issue.code}-${issue.target.entityId}`}>
            {issue.message}
          </div>
        ))}
      </div>

      {showMatches && matchingRows.length === 0 && (
        <p className="text-sm text-slate-600">No matching Projects are currently available.</p>
      )}

      {showMatches && matchingRows.length > 1 && (
        <div className="grid gap-2">
          {matchingRows.map((row) => (
            <button
              className="rounded-md border border-slate-300 p-3 text-left text-sm"
              key={row.projectId}
              onClick={() => onSelectProject(row.projectId)}
              type="button"
            >
              {row.year} · {row.productLine} · {row.projectName} · {row.qciModelName}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <button
          className="rounded-md border border-slate-300 px-4 py-2 text-sm"
          onClick={onBackToForm}
          type="button"
        >
          Back to form
        </button>
        {decision.actions.map((action) => (
          <button
            className={action.direction === "forward"
              ? "rounded-md border border-slate-900 bg-slate-900 px-4 py-2 text-sm text-white"
              : "rounded-md border border-slate-300 px-4 py-2 text-sm"}
            data-direction={action.direction}
            key={action.id}
            onClick={action.id === "reviewExisting" ? reviewExisting : onCreateAnyway}
            type="button"
          >
            {action.id === "reviewExisting" ? "Review Existing" : "Create Anyway"}
          </button>
        ))}
      </div>
    </section>
  );
}
