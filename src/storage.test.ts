import { DEFAULT_WEIGHTS, normalizeWeights } from "./scoring";
import { stored } from "./hooks/useFilters";
import { mergeOutreach, mergeVendorPricing, normalizeEvents } from "./data";
import shippedEvents from "../data/events.json";
import { resolveHomeBase } from "./homeBase";
import {
  importPriority,
  normalizeOverrides,
  WEIGHTS_KEY,
  OVERRIDES_KEY,
  HOME_BASE_KEY,
} from "./storage";
import { describe, it, expect, vi } from "vitest";
import {
  applyGoing,
  changeStage,
  stageSuggestions,
  withSuggestedStages,
  inverseGoingPatch,
  undoGoingPatch,
  undoStagePatch,
  stages,
  stashBeforeReplace,
  backup,
  validateBackup,
  emptyEntry,
  migrateLegacy,
  loadEntries,
  saveValue,
  importEntries,
  importOutreach,
  unknownIds,
  STORAGE_KEY,
} from "./storage";
import type { MilestoneEdits, OutreachPatches } from "./storage";
const entry = {
  ...emptyEntry,
  stage: "Considering" as const,
  note: "Booth: $200\nCall Friday",
  noteUpdatedAt: "2026-11-16T10:00:00.000Z",
};
describe("versioned pipeline backup validation", () => {
  it("round trips first-run, reminder and timeline preferences alongside planner records", () => {
    const listPreferences = { firstRunDismissed: true, deadlinesExpanded: false, followUpsExpanded: true, showPast: false };
    const value = backup({ event: entry }, undefined, undefined, undefined, undefined, undefined, listPreferences);
    expect(validateBackup(JSON.parse(JSON.stringify(value)))).toEqual(value);
    expect(validateBackup(backup({ event: entry })).listPreferences).toBeUndefined();
    expect(() => validateBackup({ ...value, listPreferences: { firstRunDismissed: "yes" } })).toThrow(/list preference/i);
  });
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
    ["New", "Not reviewed"],
    ["Interested", "Considering"],
    ["Pass", "Passed"],
    ["Paid / attending", "Booked"],
    ["Contacted", "Contacted"],
    ["Need to pay", "Need to pay"],
    ["Too expensive", "Too expensive"],
  ])("migrates %s to %s in backups and local storage", (oldStage, stage) => {
    const storedEntry = { ...entry, stage: oldStage, stageUpdatedAt: entry.noteUpdatedAt };
    const old = { ...backup({}), entries: { id: storedEntry } };
    const expected = { ...storedEntry, stage };
    expect(validateBackup(old).entries.id).toEqual(expected);
    expect(loadEntries({ getItem: () => JSON.stringify(old) }).entries.id).toEqual(expected);
    expect(migrateLegacy({ id: oldStage }).id.stage).toBe(stage);
  });
  it("rejects unknown stages with the affected entry ID", () => {
    const future = { ...backup({}), entries: { event: { ...entry, stage: "Future stage" } } };
    expect(() => validateBackup(future)).toThrow("Invalid entry event: unknown pipeline stage.");
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
      '{"__proto__":{"stage":"Not reviewed","note":"","noteUpdatedAt":null,"stageUpdatedAt":null}}',
    );
    expect(Object.keys(validateBackup(value).entries)).toEqual(["__proto__"]);
  });
});

it.each(["Passed", "Too expensive"] as const)("undoes %s through saved entries and preserves independent changes", (stage) => {
  const now = "2026-11-24T00:00:00.000Z";
  const later = "2026-11-24T00:00:04.000Z";
  const before = { event: { ...entry, stageUpdatedAt: entry.noteUpdatedAt }, other: emptyEntry };
  const { entries, undo } = changeStage(before, "event", stage, now);
  expect(entries.event).toMatchObject({ stage, stageUpdatedAt: now });
  const restoredEntries = validateBackup(backup(entries)).entries;
  const edited = { ...restoredEntries, event: { ...restoredEntries.event, note: "New note", noteUpdatedAt: later } };
  const restored = undoStagePatch(edited, undo, later);
  expect(restored.event).toEqual({ ...before.event, stageUpdatedAt: later, note: "New note", noteUpdatedAt: later });
  expect(restored.other).toEqual(before.other);
  expect(undoStagePatch(restored, undo, later)).toBe(restored);
});

it("keeps the first stage Undo through backup merges and restores stage suggestions", () => {
  const changedAt = "2026-11-24T00:00:00.000Z";
  const { entries, undo } = changeStage({}, "event", "Passed", changedAt);
  const restored = undoStagePatch(entries, undo, changedAt);
  const exported = validateBackup(JSON.parse(JSON.stringify(backup(restored)))).entries;
  expect(importEntries(entries, exported, "merge")).toEqual(restored);
  expect(importEntries(exported, entries, "merge")).toEqual(restored);
  expect(withSuggestedStages(exported, { event: "Contacted" }).event).toMatchObject({
    stage: "Contacted", stageSuggested: true,
  });
  const explicit = changeStage(exported, "event", "Not reviewed", "2026-11-24T00:00:05.000Z").entries;
  expect(withSuggestedStages(explicit, { event: "Contacted" }).event.stage).toBe("Not reviewed");
});

describe("decision stage suggestions", () => {
  const events = normalizeEvents(shippedEvents);
  const colorFiesta = events.find(({ id }) => id === "color18")!;
  const base = { ...colorFiesta, id: "id", outreach: null, vendor_options: [], vendor_documents: [] };

  it.each(["zubculture", "mefcc-2027", "color18", "jet-2027"])("suggests Quote received for %s", (id) => {
    const stages = withSuggestedStages({}, stageSuggestions(events));
    expect(stages[id]).toMatchObject({ stage: "Quote received", stageUpdatedAt: null, stageSuggested: true });
  });

  it.each(["cardcon3", "urban", "scan-suntec-asia-comic-expo-005-202701", "scan-supanova-supanova-comic-con-gaming-sydney-202706"])(
    "leaves %s unreviewed when the organizer only published rates", (id) => {
      const event = events.find((candidate) => candidate.id === id)!;
      expect(event.vendor_options?.length).toBeGreaterThan(0);
      expect(stageSuggestions([event])[id]).toBeUndefined();
    },
  );

  it.each([
    ["contacted", "Contacted"],
    ["replied", "Contacted"],
    ["quoted", "Quote received"],
    ["declined", "Passed"],
    ["not_contacted", "Not reviewed"],
  ] as const)("suggests a stage for outreach marked %s", (status, stage) => {
    const event = { ...base, outreach: mergeOutreach(null, { status }) };
    const entries = withSuggestedStages({ id: emptyEntry }, stageSuggestions([event]));
    expect(entries.id).toEqual(stage === "Not reviewed" ? emptyEntry : { ...emptyEntry, stage, stageSuggested: true });
  });

  it("uses logged prices and this-edition package quotes, excluding catalogue prices, add-ons and past-year quotes", () => {
    const replied = { ...base, outreach: mergeOutreach(null, { status: "replied", quoted_price: "VND 300,000" }) };
    const option = colorFiesta.vendor_options![0];
    const itemized = { ...base, vendor_options: [option] };
    const published = { ...base, vendor_options: [{ ...option, basis: "published" as const }] };
    const addOn = { ...base, vendor_options: [{ ...option, kind: "add_on" as const }] };
    const historical = { ...base, vendor_options: [{ ...option, rate_status: "past_year" as const }] };
    expect([replied, itemized, published, addOn, historical].map((event) => stageSuggestions([event]).id))
      .toEqual(["Quote received", "Quote received", undefined, undefined, undefined]);
    const contacted = mergeOutreach(null, { status: "contacted" });
    expect(stageSuggestions([{ ...published, outreach: contacted }]).id).toBe("Contacted");
  });

  it("uses a typed proposal in a reply and preserves its type in old document edits", () => {
    const japan = events.find(({ id }) => id === "jet-2027")!;
    const { kind, ...oldDoc } = japan.vendor_documents![0];
    const reply = { ...base, outreach: mergeOutreach(null, { status: "replied" }) };
    expect(stageSuggestions([{ ...reply, vendor_documents: [oldDoc] }]).id).toBe("Contacted");
    const proposal = { ...reply, vendor_documents: [{ ...oldDoc, id: "another-doc", kind }] };
    const edit = { vendor_documents: [{ ...oldDoc, id: "another-doc", label: "Edited proposal label" }] };
    const restored = validateBackup(backup({}, undefined, undefined, undefined, { id: edit })).vendorPricing!;
    expect(stageSuggestions([{ ...proposal, ...mergeVendorPricing(proposal, restored.id) }]).id).toBe("Quote received");
    const reference = { vendor_documents: [{ ...edit.vendor_documents[0], kind: "reference" as const }] };
    expect(stageSuggestions([{ ...proposal, ...mergeVendorPricing(proposal, reference) }]).id).toBe("Contacted");
  });

  it("suggests Passed when the organizer declines after sending a quote", () => {
    const declined = { ...colorFiesta, outreach: mergeOutreach(colorFiesta.outreach, { status: "declined" }) };
    expect(stageSuggestions([declined])[declined.id]).toBe("Passed");
  });

  it("changes untouched suggestions as evidence arrives and keeps explicit entries through a backup", () => {
    const outreach = { status: "contacted" as const };
    const contacted = { ...base, outreach: mergeOutreach(null, outreach) };
    const quoted = { ...base, outreach: mergeOutreach(null, { ...outreach, status: "quoted" }) };
    const saved = { id: { ...emptyEntry, note: "Ask about power" } };
    expect(withSuggestedStages(saved, stageSuggestions([contacted])).id).toMatchObject({ stage: "Contacted", stageSuggested: true });
    expect(withSuggestedStages(saved, stageSuggestions([quoted])).id).toMatchObject({ stage: "Quote received", stageSuggested: true });
    expect(saved.id.stage).toBe("Not reviewed");

    for (const choice of [
      { ...saved.id, stage: "Passed" as const },
      { ...saved.id, stageUpdatedAt: entry.noteUpdatedAt },
      { ...saved.id, stage: "Booked" as const, stageUpdatedAt: entry.noteUpdatedAt },
    ]) {
      const restored = validateBackup(JSON.parse(JSON.stringify(backup({ id: choice })))).entries;
      expect(withSuggestedStages(restored, stageSuggestions([quoted])).id).toEqual(choice);
    }
  });

  it("lets Going advance a Not reviewed stage while preserving a visible suggestion", () => {
    const suggestions = stageSuggestions([colorFiesta]);
    const marked = applyGoing({}, ["blank", colorFiesta.id], true, entry.noteUpdatedAt, suggestions);
    expect(marked.blank.stage).toBe("Considering");
    expect(marked[colorFiesta.id]).toMatchObject({ going: true, stage: "Not reviewed", stageUpdatedAt: null });
    expect(withSuggestedStages(marked, suggestions)[colorFiesta.id].stage).toBe("Quote received");
  });

  it("restores suggestion eligibility when an automatic Going stage is undone", () => {
    const now = entry.noteUpdatedAt;
    const before = { id: emptyEntry, reset: { ...emptyEntry, stageUpdatedAt: "2026-11-15T00:00:00.000Z" } };
    const ids = ["id", "reset"];
    const marked = applyGoing(before, ids, true, now);
    const patch = inverseGoingPatch(before, marked, ids);
    const undoneAt = "2026-11-16T10:00:01.000Z";
    const undone = undoGoingPatch(marked, patch, now, undoneAt);
    const displayed = withSuggestedStages(undone, { id: "Contacted", reset: "Contacted" });
    expect(displayed.id).toMatchObject({ stage: "Contacted", stageUpdatedAt: undoneAt, stageSuggested: true });
    expect(displayed.reset).toMatchObject({ stage: "Not reviewed", stageUpdatedAt: undoneAt });
  });
});

describe("outreach backup patches", () => {
  const current: OutreachPatches = {
    event: { method: "form", notes: "Old notes", contacted_at: "2026-11-19" },
    absent: { status: "declined" },
  };
  const incoming: OutreachPatches = {
    event: {
      status: "quoted", notes: "", quoted_price: "$185", response_at: "2026-11-20",
      next_action: "reply_to_organizer", follow_up_due_at: "2026-11-27", acknowledgement_at: null,
    },
  };
  it("round trips patches through local storage and merges only fields supplied by the import", () => {
    const { outreach } = validateBackup(JSON.parse(JSON.stringify(backup({}, undefined, incoming))));
    expect(outreach).toEqual(incoming);
    const patches = importOutreach(current, outreach, "merge");
    expect(patches.event).toEqual({ ...current.event, ...incoming.event });
    expect(patches.absent).toEqual(current.absent);
    const loaded = loadEntries({ getItem: () => JSON.stringify(backup({}, undefined, patches)) });
    expect(loaded.outreach).toEqual(patches);
    expect(unknownIds({}, ["event"], {}, loaded.outreach)).toEqual(["absent"]);
    const shared = mergeOutreach(null, {
      contact_type: "form", contact: "https://example.com/apply",
      published_booth_price: "$150", notes: "Original", price_source_url: "https://example.com/prices",
    });
    expect(mergeOutreach(shared, loaded.outreach.event)).toEqual({ ...shared, ...patches.event });
    expect(importOutreach(current, outreach, "replace")).toEqual(incoming);
  });

  it("accepts old backups and distinguishes an absent outreach block from an empty one", () => {
    const legacy = validateBackup(backup({ event: entry }));
    expect(legacy.outreach).toBeUndefined();
    expect(importOutreach(current, legacy.outreach, "replace")).toBe(current);
    expect(importOutreach(current, {}, "replace")).toEqual({});
  });

  it("rejects invalid patch values and recovers valid local outreach from a damaged backup", () => {
    const raw = {
      ...backup({ event: entry }, undefined, incoming),
      outreach: { ...incoming, broken: { response_at: "2026-02-30" } },
    };
    expect(() => validateBackup(raw)).toThrow("Invalid outreach for broken");
    const recovered = loadEntries({ getItem: () => JSON.stringify(raw) });
    expect(recovered.entries.event).toEqual(entry);
    expect(recovered.outreach).toEqual(incoming);
    expect(recovered.dropped).toBe(1);
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
      "Considering",
      "Considering",
      "Applied",
      "Need to pay",
      "Passed",
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
    ).toBe("Passed");
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
        stage: "Passed" as const,
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
  it("reads score settings from storage, tolerates corrupt JSON, and keeps zero overrides", () => {
    const memory = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      setItem: (k: string, v: string) => memory.set(k, v),
      getItem: (k: string) => memory.get(k) ?? null,
    });
    try {
      expect(saveValue(WEIGHTS_KEY, priority.weights)).toBe("");
      expect(saveValue(OVERRIDES_KEY, priority.overrides)).toBe("");
      expect(saveValue(HOME_BASE_KEY, "vn-hanoi")).toBe("");
      expect(resolveHomeBase(stored(HOME_BASE_KEY)).city).toBe("Hanoi");
      memory.set(HOME_BASE_KEY, "{broken");
      expect(resolveHomeBase(stored(HOME_BASE_KEY)).city).toBe("Ho Chi Minh City");
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

  it("round trips the home base alongside outreach and booking milestone edits", () => {
    const withHomeBase = { ...priority, homeBase: "th-bangkok" };
    const outreach = { known: { notes: "Confirm booth size" } };
    const milestones: MilestoneEdits = { known: [{
      id: "balance-due", label: "Balance due", type: "payment_due", at: "2026-12-21",
      timeZone: "Asia/Singapore", source: "Organizer email", verified: true,
    }] };
    const restored = validateBackup(JSON.parse(JSON.stringify(
      backup({ known: entry }, withHomeBase, outreach, milestones),
    )));
    expect(restored).toMatchObject({ entries: { known: entry }, priority: withHomeBase, outreach, milestones });
    const current = { ...priority, homeBase: "vn-hanoi" };
    for (const mode of ["merge", "replace"] as const) {
      expect(importPriority(current, restored.priority, mode)).toEqual(withHomeBase);
      expect(importPriority(current, validateBackup(backup({}, priority)).priority, mode)).toEqual(current);
      expect(importPriority(current, validateBackup(backup({})).priority, mode)).toBe(current);
    }
  });

  it("retains an unknown home base ID for preview and applies the other priority settings", () => {
    const imported = validateBackup(backup({}, { ...priority, homeBase: "not-a-preset" })).priority;
    expect(imported?.homeBase).toBe("not-a-preset");
    const current = { weights: { ...DEFAULT_WEIGHTS }, overrides: { other: 75 }, homeBase: "vn-hanoi" };
    expect(importPriority(current, imported, "merge")).toEqual({
      ...priority, overrides: { ...priority.overrides, other: 75 }, homeBase: current.homeBase,
    });
    expect(importPriority(current, imported, "replace")).toEqual({ ...priority, homeBase: current.homeBase });
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
      stage: stage === "Not reviewed" ? "Considering" : stage,
      stageUpdatedAt: stage === "Not reviewed" ? now : entry.stageUpdatedAt,
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
      paid: { ...emptyEntry, stage: "Booked" as const },
      other: entry,
    };
    const marked = applyGoing(current, ["new", "paid"], true, now);
    expect(marked.new.stage).toBe("Considering");
    expect(marked.paid.stage).toBe("Booked");
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
    paid: { ...entry, stage: "Booked" as const },
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
    stage: "Not reviewed",
    note: "Edited after marking",
    stageUpdatedAt: now,
    stageInferred: true,
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
    stage: "Considering",
    stageUpdatedAt: changedAt,
  });
});
