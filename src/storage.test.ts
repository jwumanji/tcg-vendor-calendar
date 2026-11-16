import { describe, it, expect, vi } from "vitest";
import {
  stashBeforeReplace,
  backup,
  validateBackup,
  emptyEntry,
  migrateLegacy,
  loadEntries,
  saveValue,
  importEntries,
  unknownIds,
  STORAGE_KEY,
} from "./storage";
const entry = {
  ...emptyEntry,
  stage: "Interested" as const,
  note: "Booth: $200\nCall Friday",
  noteUpdatedAt: "2026-11-16T10:00:00.000Z",
};
describe("versioned pipeline backup validation", () => {
  it("round trips notes and timestamps and ignores unknown fields", () => {
    const value = backup({ event: entry, missing: emptyEntry });
    expect(
      validateBackup({
        ...value,
        extra: true,
        entries: { event: { ...entry, extra: "ignore" }, missing: emptyEntry },
      }),
    ).toEqual(value);
  });
  it.each([
    null,
    [],
    {},
    { version: 2 },
    { ...backup({}), exportedAt: "yesterday" },
    { ...backup({}), entries: [] },
  ])("rejects malformed envelopes %j", (value) => {
    expect(() => validateBackup(value)).toThrow();
  });
  it.each([
    { stage: "Applied" },
    { note: 42 },
    { noteUpdatedAt: "2026-02-30T10:00:00.000Z" },
    { stageUpdatedAt: 0 },
    { noteUpdatedAt: undefined },
  ])("rejects malformed entries %j", (patch) => {
    expect(() =>
      validateBackup(backup({ id: { ...entry, ...patch } as typeof entry })),
    ).toThrow();
  });
  it("handles special object keys as ordinary event IDs", () => {
    const value = JSON.parse(JSON.stringify(backup({})));
    value.entries = JSON.parse(
      '{"__proto__":{"stage":"New","note":"","noteUpdatedAt":null,"stageUpdatedAt":null}}',
    );
    expect(Object.keys(validateBackup(value).entries)).toEqual(["__proto__"]);
  });
});
describe("storage and refresh persistence", () => {
  it("migrates each old plan without deleting absent IDs", () => {
    const entries = migrateLegacy({
      a: "Interested",
      b: "Planning to vend",
      c: "Applied",
      d: "Accepted",
      absent: "Skip",
      invalid: "bad",
    });
    expect(Object.values(entries).map((e) => e.stage)).toEqual([
      "Interested",
      "Interested",
      "Contacted",
      "Need to pay",
      "Pass",
    ]);
    const getItem = vi.fn((key: string) =>
      key === STORAGE_KEY ? JSON.stringify(backup(entries)) : null,
    );
    expect(loadEntries({ getItem }).entries).toEqual(entries);
    expect(unknownIds(entries, ["a", "b", "c", "d"])).toEqual(["absent"]);
  });
  it("reads legacy data only when no versioned backup exists", () => {
    expect(
      loadEntries({
        getItem: (key) => (key === "tcg-plans" ? '{"old":"Skip"}' : null),
      }).entries.old.stage,
    ).toBe("Pass");
    expect(
      loadEntries({
        getItem: (key) =>
          key === STORAGE_KEY ? JSON.stringify(backup({})) : '{"old":"Skip"}',
      }).entries,
    ).toEqual({});
  });
  it("merges by ID and replaces only after the selected mode", () => {
    const current = { absent: entry, same: entry };
    const incoming = { same: emptyEntry, new: entry };
    expect(importEntries(current, incoming, "merge")).toEqual({
      absent: entry,
      same: entry,
      new: entry,
    });
    expect(importEntries(current, incoming, "replace")).toEqual(incoming);
    expect(current.same).toBe(entry);
  });
  it("reports unavailable, corrupt, and full storage", () => {
    expect(
      loadEntries({
        getItem: () => {
          throw new Error("denied");
        },
      }).error,
    ).toBeTruthy();
    expect(loadEntries({ getItem: () => "{broken" }).error).toBeTruthy();
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new Error("quota");
      },
    });
    expect(saveValue(STORAGE_KEY, backup({}))).toContain("Could not save");
    vi.unstubAllGlobals();
  });
});

describe("recovery and timestamp merge regressions", () => {
  it("salvages valid entries individually and preserves the exact original", () => {
    const raw = JSON.stringify(
      backup({
        good: entry,
        broken: { ...entry, stage: "Renamed stage" } as unknown as typeof entry,
      }),
    );
    const setItem = vi.fn();
    const result = loadEntries({ getItem: () => raw, setItem });
    expect(result.entries).toEqual({ good: entry });
    expect(result.dropped).toBe(1);
    expect(result.error).toContain("Automatic saving is paused");
    expect(setItem).toHaveBeenCalledWith(
      expect.stringMatching(/^tcg-pipeline-v1-corrupt-/),
      raw,
    );
    expect(result.recoveryKey).toBeTruthy();
  });
  it("salvages future envelopes without silently upgrading or discarding their raw data", () => {
    const raw = JSON.stringify({ ...backup({ good: entry }), version: 2 });
    const result = loadEntries({ getItem: () => raw, setItem: vi.fn() });
    expect(result.entries.good).toEqual(entry);
    expect(result.raw).toBe(raw);
    expect(result.error).toBeTruthy();
  });
  it("retains raw JSON for export if preservation fails", () => {
    const result = loadEntries({
      getItem: () => "{broken",
      setItem: () => {
        throw new Error("quota");
      },
    });
    expect(result.raw).toBe("{broken");
    expect(result.recoveryKey).toBeNull();
    expect(result.error).toContain("Export the original");
  });
  it("merges note and stage independently by timestamp, retaining local ties", () => {
    const older = "2026-11-15T10:00:00.000Z",
      newer = "2026-11-16T10:00:00.000Z";
    const current = {
      id: {
        ...entry,
        stage: "Contacted" as const,
        stageUpdatedAt: newer,
        note: "old note",
        noteUpdatedAt: older,
      },
    };
    const incoming = {
      id: {
        ...entry,
        stage: "Pass" as const,
        stageUpdatedAt: older,
        note: "new note",
        noteUpdatedAt: newer,
      },
    };
    const result = importEntries(current, incoming, "merge");
    expect(result.id).toEqual({
      ...current.id,
      note: "new note",
      noteUpdatedAt: newer,
    });
    expect(
      importEntries(result, { id: { ...result.id, note: "tie" } }, "merge"),
    ).toEqual(result);
    expect(importEntries(current, incoming, "replace")).toEqual(incoming);
  });
});

describe("replace safety net", () => {
  it("stashes current entries before replacement and fails closed on storage errors", () => {
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { setItem });
    try {
      const key = stashBeforeReplace({ id: entry });
      expect(key).toMatch(/^tcg-pipeline-v1-before-replace-/);
      expect(
        validateBackup(JSON.parse(setItem.mock.calls[0][1])).entries,
      ).toEqual({ id: entry });
      setItem.mockImplementation(() => {
        throw new Error("quota");
      });
      expect(() => stashBeforeReplace({ id: entry })).toThrow("quota");
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("explains invalid entry fields", () => {
    expect(() =>
      validateBackup({
        ...backup({}),
        entries: { test: { ...entry, note: 42 } },
      }),
    ).toThrow("note must be text");
  });
});
