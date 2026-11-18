import { DEFAULT_WEIGHTS, normalizeWeights } from "./scoring";
import { stored } from "./hooks/useFilters";
import {
  importPriority,
  normalizeOverrides,
  WEIGHTS_KEY,
  OVERRIDES_KEY,
} from "./storage";
import { describe, it, expect, vi } from "vitest";
import {
  applyGoing,
  inverseGoingPatch,
  undoGoingPatch,
  stages,
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

describe("priority preferences and backups", () => {
  const priority = {
    weights: normalizeWeights({ scale: 52 }),
    overrides: { known: 0, absent: 88 },
  };
  it("reads both storage keys, tolerates corrupt JSON, and keeps zero overrides", () => {
    const memory = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      setItem: (k: string, v: string) => memory.set(k, v),
      getItem: (k: string) => memory.get(k) ?? null,
    });
    try {
      expect(saveValue(WEIGHTS_KEY, priority.weights)).toBe("");
      expect(saveValue(OVERRIDES_KEY, priority.overrides)).toBe("");
      expect(normalizeWeights(stored(WEIGHTS_KEY))).toEqual(priority.weights);
      expect(normalizeOverrides(stored(OVERRIDES_KEY))).toEqual(
        priority.overrides,
      );
      memory.set(WEIGHTS_KEY, "{broken");
      expect(normalizeWeights(stored(WEIGHTS_KEY))).toEqual(DEFAULT_WEIGHTS);
      expect(normalizeOverrides([])).toEqual({});
      expect(
        normalizeOverrides({
          " ": 50,
          a: -12,
          b: 300,
          c: 80.7,
          d: "90",
          e: NaN,
          f: null,
        }),
      ).toEqual({ a: 0, b: 100, c: 81 });
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("round trips notes, weights and overrides, preserving old backups", () => {
    const restored = validateBackup(
      JSON.parse(JSON.stringify(backup({ known: entry }, priority))),
    );
    expect(restored).toMatchObject({ entries: { known: entry }, priority });
    expect(
      unknownIds(restored.entries, ["known"], restored.priority?.overrides),
    ).toEqual(["absent"]);
    const current = {
      weights: { ...DEFAULT_WEIGHTS },
      overrides: { other: 75, known: 44 },
    };
    expect(importPriority(current, restored.priority, "replace")).toEqual(
      priority,
    );
    expect(importPriority(current, restored.priority, "merge")).toEqual({
      ...priority,
      overrides: { ...priority.overrides, other: 75 },
    });
    for (const mode of ["merge", "replace"] as const)
      expect(
        importPriority(current, validateBackup(backup({})).priority, mode),
      ).toBe(current);
  });
});

describe("Going choices", () => {
  const now = "2026-11-18T05:00:00.000Z";
  it("loads pre-Going storage and backups with Going off", () => {
    const old = {
      ...backup({}),
      entries: {
        id: {
          note: "Keep",
          stage: "Contacted",
          noteUpdatedAt: null,
          stageUpdatedAt: null,
        },
      },
    };
    const normalized = validateBackup(old).entries;
    expect(normalized.id).toEqual({
      ...emptyEntry,
      note: "Keep",
      stage: "Contacted",
    });
    expect(loadEntries({ getItem: () => JSON.stringify(old) }).entries).toEqual(
      normalized,
    );
  });
  it.each(stages)("marks and unmarks an event from %s", (stage) => {
    const marked = applyGoing({ id: { ...entry, stage } }, ["id"], true, now);
    expect(marked.id).toEqual({
      ...entry,
      stage: stage === "New" ? "Interested" : stage,
      stageUpdatedAt: stage === "New" ? now : entry.stageUpdatedAt,
      going: true,
      goingUpdatedAt: now,
    });
    const later = "2026-11-19T05:00:00.000Z";
    expect(applyGoing(marked, ["id"], false, later).id).toEqual({
      ...marked.id,
      going: false,
      goingUpdatedAt: later,
    });
  });
  it("applies a bulk edit and restores the newest Going choice independently", () => {
    const current = {
      paid: { ...emptyEntry, stage: "Paid / attending" as const },
      other: entry,
    };
    const marked = applyGoing(current, ["new", "paid"], true, now);
    expect(marked.new.stage).toBe("Interested");
    expect(marked.paid.stage).toBe("Paid / attending");
    expect(marked.other).toBe(current.other);
    const restored = validateBackup(
      JSON.parse(JSON.stringify(backup(marked))),
    ).entries;
    expect(importEntries(current, restored, "replace")).toEqual(marked);
    expect(importEntries(current, restored, "merge")).toEqual(marked);
    const later = applyGoing(
      marked,
      ["paid"],
      false,
      "2026-11-19T05:00:00.000Z",
    );
    expect(importEntries(later, restored, "merge")).toEqual(later);
  });
});

it("undoes only changed Going values and stages synced by that action", () => {
  const ids = ["new", "paid", "already", "new"];
  const before = {
    paid: { ...entry, stage: "Paid / attending" as const },
    already: { ...entry, going: true },
  };
  const changedAt = "2026-11-17T00:00:00.000Z";
  const now = "2026-11-18T00:00:00.000Z";
  const marked = applyGoing(before, ids, true, changedAt);
  const patch = inverseGoingPatch(before, marked, ids);
  expect(patch.map((change) => change.id)).toEqual(["new", "paid"]);
  const withNote = {
    ...marked,
    new: { ...marked.new, note: "Edited after marking" },
  };
  const undone = undoGoingPatch(withNote, patch, changedAt, now);
  expect(undone.new).toMatchObject({
    going: false,
    stage: "New",
    note: "Edited after marking",
    stageUpdatedAt: now,
  });
  expect(undone.paid).toEqual({ ...before.paid, goingUpdatedAt: now });
  expect(undone.already).toBe(before.already);
  const edited = {
    ...marked,
    new: { ...marked.new, stage: "Contacted" as const, stageUpdatedAt: now },
  };
  expect(undoGoingPatch(edited, patch, changedAt, now).new.stage).toBe(
    "Contacted",
  );
  const removed = applyGoing(marked, ids, false, now);
  const restored = undoGoingPatch(
    removed,
    inverseGoingPatch(marked, removed, ids),
    now,
    now,
  );
  expect(restored.new).toMatchObject({
    going: true,
    stage: "Interested",
    stageUpdatedAt: changedAt,
  });
});
