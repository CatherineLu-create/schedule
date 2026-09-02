import { describe, expect, it } from "vitest";

import {
  capturePreviousIdentityAlias,
  normalizeProjectIdentityName,
  projectIdentityNamesMatch,
  type ProjectIdentityAlias,
} from "./projectIdentity";

describe("project identity normalization", () => {
  it("trims leading and trailing whitespace", () => {
    expect(normalizeProjectIdentityName(" Project Alpha ")).toBe("project alpha");
  });

  it("normalizes casing and repeated whitespace", () => {
    expect(normalizeProjectIdentityName("Project   Alpha")).toBe(
      "project alpha",
    );
    expect(normalizeProjectIdentityName("PROJECT ALPHA")).toBe(
      "project alpha",
    );
  });
});

describe("project identity matching", () => {
  it("matches names after only safe normalization", () => {
    expect(
      projectIdentityNamesMatch(" Project Alpha ", "project alpha"),
    ).toBe(true);
    expect(
      projectIdentityNamesMatch("Project   Alpha", "Project Alpha"),
    ).toBe(true);
  });

  it("keeps dash, underscore, and punctuation significant", () => {
    expect(projectIdentityNamesMatch("Signal_A", "Signal-A")).toBe(false);
    expect(projectIdentityNamesMatch("ABC-123", "ABC123")).toBe(false);
  });

  it("does not treat missing names as a confirmed identity match", () => {
    expect(projectIdentityNamesMatch(null, null)).toBe(false);
    expect(projectIdentityNamesMatch("  ", "")).toBe(false);
    expect(projectIdentityNamesMatch(null, "Project Alpha")).toBe(false);
  });
});

describe("hidden project identity aliases", () => {
  it("captures a previous STN Project Name with its original value", () => {
    const aliases = capturePreviousIdentityAlias({
      aliases: [],
      kind: "stnProjectName",
      previousValue: "Project Alpha",
      nextValue: "Project Beta",
    });

    expect(aliases).toEqual([
      {
        kind: "stnProjectName",
        originalValue: "Project Alpha",
        normalizedValue: "project alpha",
      },
    ] satisfies ProjectIdentityAlias[]);
  });

  it("captures a previous QCI Model Name independently", () => {
    const aliases = capturePreviousIdentityAlias({
      aliases: [],
      kind: "qciModelName",
      previousValue: "Model Alpha",
      nextValue: "Model Beta",
    });

    expect(aliases).toEqual([
      {
        kind: "qciModelName",
        originalValue: "Model Alpha",
        normalizedValue: "model alpha",
      },
    ] satisfies ProjectIdentityAlias[]);
  });

  it.each([null, "", " \t "])(
    "does not capture a non-meaningful previous name (%s)",
    (previousValue) => {
      expect(
        capturePreviousIdentityAlias({
          aliases: [],
          kind: "stnProjectName",
          previousValue,
          nextValue: "Project Beta",
        }),
      ).toEqual([]);
    },
  );

  it("does not capture a rename with the same normalized identity", () => {
    expect(
      capturePreviousIdentityAlias({
        aliases: [],
        kind: "stnProjectName",
        previousValue: " Project   Alpha ",
        nextValue: "project alpha",
      }),
    ).toEqual([]);
  });

  it("captures a meaningful previous name when the next value is cleared", () => {
    expect(
      capturePreviousIdentityAlias({
        aliases: [],
        kind: "qciModelName",
        previousValue: "Model Alpha",
        nextValue: null,
      }),
    ).toEqual([
      {
        kind: "qciModelName",
        originalValue: "Model Alpha",
        normalizedValue: "model alpha",
      },
    ]);
  });

  it("does not duplicate an existing alias with the same kind and normalized value", () => {
    const existingAliases: readonly ProjectIdentityAlias[] = Object.freeze([
      Object.freeze({
        kind: "stnProjectName" as const,
        originalValue: "Project Alpha",
        normalizedValue: "project alpha",
      }),
    ]);

    const result = capturePreviousIdentityAlias({
      aliases: existingAliases,
      kind: "stnProjectName",
      previousValue: " PROJECT   ALPHA ",
      nextValue: "Project Beta",
    });

    expect(result).toBe(existingAliases);
    expect(existingAliases).toHaveLength(1);
  });

  it("keeps matching normalized aliases for different name kinds", () => {
    const existingAliases: readonly ProjectIdentityAlias[] = Object.freeze([
      Object.freeze({
        kind: "stnProjectName" as const,
        originalValue: "Project Alpha",
        normalizedValue: "project alpha",
      }),
    ]);

    const result = capturePreviousIdentityAlias({
      aliases: existingAliases,
      kind: "qciModelName",
      previousValue: "PROJECT ALPHA",
      nextValue: "Model Beta",
    });

    expect(result).toEqual([
      existingAliases[0],
      {
        kind: "qciModelName",
        originalValue: "PROJECT ALPHA",
        normalizedValue: "project alpha",
      },
    ]);
    expect(result).not.toBe(existingAliases);
    expect(existingAliases).toHaveLength(1);
  });
});
