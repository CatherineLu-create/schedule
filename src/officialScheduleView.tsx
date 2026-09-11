import type { CurrentPublishedScheduleRead } from "./application/selectors/scheduleSelectors";

export interface OfficialScheduleViewProps {
  readonly read: CurrentPublishedScheduleRead;
}

export function OfficialScheduleView({
  read,
}: OfficialScheduleViewProps): React.ReactElement {
  return (
    <section
      aria-label="Schedule"
      className="overflow-hidden rounded-md border border-slate-200 bg-white"
    >
      <div className="p-4">
        <h2 className="text-lg font-semibold">Schedule</h2>
        {read.kind === "unavailable" && (
          <p className="mt-3 text-sm text-slate-600">
            Schedule data unavailable
          </p>
        )}
        {read.kind === "noPublishedSchedule" && (
          <p className="mt-3 text-sm text-slate-600">
            No published schedule
          </p>
        )}
        {read.kind === "published" && (
          <div className="mt-2 text-sm text-slate-600">
            {read.versionLabel}
          </div>
        )}
      </div>

      {read.kind === "published" &&
        (read.milestoneRows.length === 0 ? (
          <p className="border-t border-slate-200 px-4 py-4 text-sm text-slate-600">
            No milestones
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-t border-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Phase</th>
                  <th className="px-4 py-3 font-semibold">Stage</th>
                  <th className="px-4 py-3 font-semibold">Milestone</th>
                  <th className="px-4 py-3 font-semibold">Plan</th>
                  <th className="px-4 py-3 font-semibold">Actual</th>
                </tr>
              </thead>
              <tbody>
                {read.milestoneRows.map((row) => (
                  <tr className="border-t border-slate-200" key={row.milestoneId}>
                    <td className="px-4 py-3 font-medium">{row.phase}</td>
                    <td className="px-4 py-3">{row.stage}</td>
                    <td className="px-4 py-3">
                      <span>{row.milestone}</span>{" "}
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        {row.applicability === "applicable"
                          ? "Applicable"
                          : "Not applicable"}
                      </span>
                    </td>
                    <td className="px-4 py-3">{row.plan}</td>
                    <td className="px-4 py-3">{row.actual}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </section>
  );
}
