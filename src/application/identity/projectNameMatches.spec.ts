import { expect, it } from "vitest";
import { findSameNameProjects, normalizeStnProjectName } from "./projectNameMatches";
import { devProject001 } from "../../fixtures/v2/canonicalProjectFixtures";
it("matches only trimmed case-insensitive current names, excludes self and preserves internal spaces", () => {
 expect(normalizeStnProjectName(" MANTA ")).toBe("manta");
 expect(normalizeStnProjectName("Manta  14")).not.toBe(normalizeStnProjectName("Manta 14"));
 expect(findSameNameProjects([devProject001], " manta ")).toEqual([devProject001]);
 expect(findSameNameProjects([devProject001], "Manta", devProject001.id)).toEqual([]);
 for (const name of [null, "", "  ", "Man", "Manta 14"]) expect(findSameNameProjects([devProject001], name)).toEqual([]);
});
it("ignores aliases and QCI-only similarity when the current STN name differs", () => {
 const project = { ...devProject001, master: { ...devProject001.master, basicInformation: { ...devProject001.master.basicInformation, stnProjectName: "Different STN", qciModelName: "Manta" } },
  identityAliases: [{ kind: "stnProjectName" as const, originalValue: "Manta", normalizedValue: "manta" }] };
 expect(findSameNameProjects([project], "Manta")).toEqual([]);
});
