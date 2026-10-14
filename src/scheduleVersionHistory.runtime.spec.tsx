import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./main";
import { prototypeReducer } from "./application/state/prototypeReducer";
import { devProject001 } from "./fixtures/v2/canonicalProjectFixtures";
import { devSchedule001 } from "./fixtures/v2/canonicalScheduleFixtures";
import { toScheduleVersionNumber } from "./domain/schedule/schedule";
import { toMilestoneDefinitionId, toMilestoneId } from "./domain/shared/ids";
import { parseDateOnly } from "./domain/shared/dateOnly";

vi.mock("./application/state/prototypeReducer", async original => {
  const actual = await original<typeof import("./application/state/prototypeReducer")>();
  return { ...actual, prototypeReducer: vi.fn(actual.prototypeReducer) };
});
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 9, 20, 12)); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });
const history = { ...devSchedule001, publishedVersions: [8, 10, 9].map(n => ({ ...devSchedule001.publishedVersions[0], versionNumber: toScheduleVersionNumber(n), versionNote: n === 8 ? null : `Update ${n}`, milestones: [] })) };
function mount() { render(<App initialState={{ projects: [devProject001], schedules: [history] }} initialSelectedProjectId={devProject001.id} />); }
function changes() { return vi.mocked(prototypeReducer).mock.calls.map(([, action]) => action).filter(action => action.type === "scheduleReplaced"); }
it("preserves an inherited retired row, blocks Publish, and permits removal without rewriting history", () => {
  const retired = { milestoneId: toMilestoneId("retired-history"), milestoneDefinitionId: toMilestoneDefinitionId("milestone-a-a2-a-g-o"), applicability: "applicable" as const, plan: parseDateOnly("2026-10-10"), actual: null };
  const input = { ...history, publishedVersions: history.publishedVersions.map(version => version.versionNumber === 8 ? { ...version, milestones: [retired] } : version) };
  const before = structuredClone(input);
  render(<App initialState={{ projects: [devProject001], schedules: [input] }} initialSelectedProjectId={devProject001.id} />);
  fireEvent.change(screen.getByLabelText("Schedule version"), { target: { value: "8" } });
  expect(screen.getByRole("cell", { name: "A G/O Applicable" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Create Draft from v08" }));
  expect(screen.getByText("This milestone is no longer available under the current public governance. Remove it before publishing.")).toBeVisible();
  expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
  expect(within(screen.getByLabelText("Milestone definition")).queryByRole("option", { name: "A G/O" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Remove A G/O" }));
  fireEvent.click(screen.getByRole("button", { name: "Publish" }));
  fireEvent.change(screen.getByLabelText("Publish Note"), { target: { value: "Restore with Governance cleanup" } });
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Publish" }));
  expect(changes().at(-1)?.schedule.publishedVersions.at(-1)).toMatchObject({ versionNumber: 11, milestones: [] });
  fireEvent.change(screen.getByLabelText("Schedule version"), { target: { value: "8" } });
  expect(screen.getByRole("cell", { name: "A G/O Applicable" })).toBeVisible();
  expect(input).toEqual(before);
});
it("requires applying or cancelling date text before switching away from Working Draft", () => {
  const input = { ...history, publishedVersions: history.publishedVersions.map(version => ({ ...version, milestones: devSchedule001.publishedVersions[0].milestones })) };
  render(<App initialState={{ projects: [devProject001], schedules: [input] }} initialSelectedProjectId={devProject001.id} />);
  fireEvent.click(screen.getByRole("button", { name: "Create Draft from v10" }));
  fireEvent.change(screen.getByLabelText(/^Plan for Kickoff occurrence/), { target: { value: "2026-10-16" } });
  expect(screen.getByLabelText("Schedule version")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: /^Cancel date edit for Plan for Kickoff/ }));
  expect(screen.getByLabelText("Schedule version")).toBeEnabled();
});
it("views exact read-only history, creates a traced Draft, and publishes max+1 with a stored note", () => {
  mount();
  const selector = screen.getByRole("combobox", { name: "Schedule version" });
  expect(within(selector).getAllByRole("option").map(x => x.textContent)).toEqual(["v10 · Current — Update 10", "v09 — Update 9", "v08 — No note"]);
  fireEvent.change(selector, { target: { value: "8" } });
  expect(screen.getByRole("heading", { name: "Historical Schedule" })).toBeVisible();
  expect(screen.queryByRole("textbox", { name: /Plan for/ })).not.toBeInTheDocument();
  expect(changes()).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Create Draft from v08" }));
  expect(changes().at(-1)?.schedule.workingDraft).toMatchObject({ basePublishedVersionNumber: 8, milestones: [] });
  expect(screen.getByText(/based on historical version v08/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Publish" }));
  const dialog = within(screen.getByRole("dialog", { name: "Publish Working Draft" }));
  expect(dialog.getByRole("button", { name: "Publish" })).toBeDisabled();
  fireEvent.change(dialog.getByLabelText("Publish Note"), { target: { value: "  Restore v08  " } });
  fireEvent.click(dialog.getByRole("button", { name: "Publish" }));
  const published = changes().at(-1)?.schedule;
  expect(published?.publishedVersions.at(-1)).toMatchObject({ versionNumber: 11, versionNote: "Restore v08" });
  expect(published?.publishedVersions.slice(0, 3)).toEqual(history.publishedVersions);
  expect(screen.getByText("Published v11")).toBeVisible();
});
it("keeps existing Draft while browsing and requires explicit discard before another base", () => {
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Create Draft from v10" }));
  fireEvent.change(screen.getByLabelText("Schedule version"), { target: { value: "8" } });
  expect(screen.getByRole("button", { name: "Create Draft from v08" })).toBeDisabled();
  expect(screen.getByText("Resolve the existing Working Draft first.")).toBeVisible();
  fireEvent.change(screen.getByLabelText("Schedule version"), { target: { value: "draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Discard Draft" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Keep Editing" }));
  expect(changes().at(-1)?.schedule.workingDraft?.basePublishedVersionNumber).toBe(10);
  fireEvent.click(screen.getByRole("button", { name: "Discard Draft" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Discard Draft" }));
  fireEvent.change(screen.getByLabelText("Schedule version"), { target: { value: "8" } });
  fireEvent.click(screen.getByRole("button", { name: "Create Draft from v08" }));
  expect(changes().at(-1)?.schedule.workingDraft?.basePublishedVersionNumber).toBe(8);
});
