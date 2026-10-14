import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { HistoricalDraftWarning, SchedulePublishConfirmation } from "./schedulePublishConfirmation";
import { createEmptyCanonicalProjectSchedule } from "./domain/schedule/officialSchedule";
import { toScheduleVersionNumber } from "./domain/schedule/schedule";
import { toCanonicalScheduleWorkingDraftId, toProjectId } from "./domain/shared/ids";

afterEach(cleanup);
const schedule = {
  ...createEmptyCanonicalProjectSchedule(toProjectId("confirmation")),
  publishedVersions: [8, 9, 10].map(n => ({ versionNumber: toScheduleVersionNumber(n), versionNote: null, publishedAt: "legacy", milestones: [] })),
  workingDraft: { workingDraftId: toCanonicalScheduleWorkingDraftId("draft"), basePublishedVersionNumber: toScheduleVersionNumber(8), milestones: [], reviewSessionIds: [], importCandidates: [] },
};
it("describes real gapped versions and never invents legacy Draft provenance", () => {
  const view = render(<HistoricalDraftWarning schedule={{ ...schedule, publishedVersions: [8, 10, 12].map(n => ({ ...schedule.publishedVersions[0], versionNumber: toScheduleVersionNumber(n) })) }} />);
  expect(screen.getByText(/Current Published is v12.*create v13.*v10, v12/)).toBeVisible();
  view.rerender(<HistoricalDraftWarning schedule={{ ...schedule, workingDraft: { ...schedule.workingDraft, basePublishedVersionNumber: undefined } }} />);
  expect(screen.getByText("Base version unavailable")).toBeVisible();
  view.rerender(<HistoricalDraftWarning schedule={{ ...schedule, workingDraft: { ...schedule.workingDraft, basePublishedVersionNumber: null } }} />);
  expect(screen.queryByText(/Base version unavailable|historical version/)).toBeNull();
});
it("requires a trimmed bounded note while a historical warning alone permits Publish", () => {
  const publish = vi.fn();
  render(<SchedulePublishConfirmation schedule={schedule} blockers={[]} onCancel={vi.fn()} onPublish={publish} />);
  expect(screen.getByText(/based on historical version v08.*Current Published is v10.*create v11/)).toBeVisible();
  expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Publish Note"), { target: { value: "x".repeat(201) } });
  expect(screen.getByText("Publish Note must be 200 characters or fewer.")).toBeVisible();
  fireEvent.change(screen.getByLabelText("Publish Note"), { target: { value: "  Restore v08  " } });
  fireEvent.click(screen.getByRole("button", { name: "Publish" }));
  expect(publish).toHaveBeenCalledWith("Restore v08");
  expect(screen.getByLabelText("Publish Note")).toHaveValue("  Restore v08  ");
});
it("shows note and future Actual issues together and resets a changed confirmation target", () => {
  const publish = vi.fn();
  const blocker = { code: "schedule.data.future-actual", domain: "schedule" as const, source: "data" as const, severity: "blocking" as const, message: "Actual date cannot be later than today.", target: { section: "schedule" } };
  const props = { schedule, blockers: [blocker], onCancel: vi.fn(), onPublish: publish };
  const view = render(<SchedulePublishConfirmation {...props} />);
  expect(screen.getByText("Publish Note is required.")).toBeVisible();
  expect(screen.getByText(blocker.message)).toBeVisible();
  fireEvent.change(screen.getByLabelText("Publish Note"), { target: { value: "Old target" } });
  view.rerender(<SchedulePublishConfirmation {...props} blockers={[]} schedule={{ ...schedule, workingDraft: { ...schedule.workingDraft, workingDraftId: toCanonicalScheduleWorkingDraftId("different") } }} />);
  expect(screen.getByLabelText("Publish Note")).toHaveValue("");
  expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
  expect(publish).not.toHaveBeenCalled();
});
