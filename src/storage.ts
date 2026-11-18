import { normalizeWeights, type Weights } from "./scoring";

export const stages = [
  "New",
  "Pass",
  "Too expensive",
  "Interested",
  "Contacted",
  "Need to pay",
  "Paid / attending",
] as const;
export type Stage = (typeof stages)[number];
export interface Entry {
  stage: Stage;
  note: string;
  noteUpdatedAt: string | null;
  stageUpdatedAt: string | null;
}
export type Entries = Record<string, Entry>;
export const emptyEntry: Entry = {
  stage: "New",
  note: "",
  noteUpdatedAt: null,
  stageUpdatedAt: null,
};
export const STORAGE_KEY = "tcg-pipeline-v1";
export const WEIGHTS_KEY = "tcg-priority-weights";
export const OVERRIDES_KEY = "tcg-priority-overrides";
export function normalizeOverrides(value: unknown): Record<string, number> {
  if (!object(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([id, score]) =>
      id.trim() && typeof score === "number" && Number.isFinite(score)
        ? [[id, Math.max(0, Math.min(100, Math.round(score)))]]
        : [],
    ),
  );
}
export interface PriorityPreferences {
  weights: Weights;
  overrides: Record<string, number>;
}
export interface Backup {
  priority?: PriorityPreferences;
  version: 1;
  exportedAt: string;
  entries: Entries;
}
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const timestamp = (v: unknown): v is string =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) &&
  !Number.isNaN(Date.parse(v)) &&
  new Date(v).toISOString() === v;
export function validateBackup(value: unknown): Backup {
  if (
    !object(value) ||
    value.version !== 1 ||
    !timestamp(value.exportedAt) ||
    !object(value.entries)
  )
    throw new Error(
      "Invalid backup: expected version 1, exportedAt and entries.",
    );
  const entries: Entries = Object.create(null);
  for (const [id, e] of Object.entries(value.entries)) {
    if (!id.trim()) throw new Error("Invalid entry: ID must not be empty.");
    if (!object(e)) throw new Error(`Invalid entry ${id}: expected an object.`);
    if (!stages.includes(e.stage as Stage))
      throw new Error(`Invalid entry ${id}: unknown pipeline stage.`);
    if (typeof e.note !== "string")
      throw new Error(`Invalid entry ${id}: note must be text.`);
    if (!(e.noteUpdatedAt === null || timestamp(e.noteUpdatedAt)))
      throw new Error(
        `Invalid entry ${id}: noteUpdatedAt must be null or an ISO UTC timestamp.`,
      );
    if (!(e.stageUpdatedAt === null || timestamp(e.stageUpdatedAt)))
      throw new Error(
        `Invalid entry ${id}: stageUpdatedAt must be null or an ISO UTC timestamp.`,
      );
    entries[id] = {
      stage: e.stage as Stage,
      note: e.note,
      noteUpdatedAt: e.noteUpdatedAt,
      stageUpdatedAt: e.stageUpdatedAt,
    };
  }
  const result: Backup = { version: 1, exportedAt: value.exportedAt, entries };
  if (value.priority !== undefined) {
    if (
      !object(value.priority) ||
      !object(value.priority.weights) ||
      !object(value.priority.overrides)
    )
      throw new Error("Invalid priority settings in backup.");
    result.priority = {
      weights: normalizeWeights(value.priority.weights),
      overrides: normalizeOverrides(value.priority.overrides),
    };
  }
  return result;
}
export function backup(
  entries: Entries,
  priority?: PriorityPreferences,
): Backup {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    entries,
    ...(priority && { priority }),
  };
}
export function importPriority(
  current: PriorityPreferences,
  incoming: PriorityPreferences | undefined,
  mode: "merge" | "replace",
): PriorityPreferences {
  if (!incoming) return current;
  return {
    weights: incoming.weights,
    overrides:
      mode === "merge"
        ? { ...current.overrides, ...incoming.overrides }
        : incoming.overrides,
  };
}
export function importEntries(
  current: Entries,
  incoming: Entries,
  mode: "merge" | "replace",
): Entries {
  const result: Entries = Object.assign(
    Object.create(null),
    mode === "merge" ? current : {},
  );
  for (const [id, next] of Object.entries(incoming)) {
    const old = result[id];
    if (!old || mode === "replace") {
      result[id] = { ...next };
      continue;
    }
    // Stage and note are independent edits; ties retain local values.
    const stage = (next.stageUpdatedAt || "") > (old.stageUpdatedAt || "");
    const note = (next.noteUpdatedAt || "") > (old.noteUpdatedAt || "");
    result[id] = {
      stage: stage ? next.stage : old.stage,
      stageUpdatedAt: stage ? next.stageUpdatedAt : old.stageUpdatedAt,
      note: note ? next.note : old.note,
      noteUpdatedAt: note ? next.noteUpdatedAt : old.noteUpdatedAt,
    };
  }
  return result;
}
export function unknownIds(
  entries: Entries,
  ids: string[],
  overrides: Record<string, number> = {},
) {
  const known = new Set(ids);
  return [
    ...new Set([...Object.keys(entries), ...Object.keys(overrides)]),
  ].filter((id) => !known.has(id));
}
export function migrateLegacy(value: unknown): Entries {
  const result: Entries = Object.create(null);
  const mapping: Record<string, Stage> = {
    Interested: "Interested",
    "Planning to vend": "Interested",
    Applied: "Contacted",
    Accepted: "Need to pay",
    Skip: "Pass",
  };
  if (object(value))
    for (const [id, plan] of Object.entries(value))
      if (typeof plan === "string" && Object.hasOwn(mapping, plan))
        result[id] = { ...emptyEntry, stage: mapping[plan] };
  return result;
}
export interface LoadedEntries {
  entries: Entries;
  error: string;
  raw: string | null;
  recoveryKey: string | null;
  dropped: number;
}
export function loadEntries(
  storage: Pick<Storage, "getItem"> & Partial<Pick<Storage, "setItem">>,
): LoadedEntries {
  let raw: string | null = null;
  const result: LoadedEntries = {
    entries: Object.create(null),
    error: "",
    raw: null,
    recoveryKey: null,
    dropped: 0,
  };
  try {
    raw = storage.getItem(STORAGE_KEY);
    if (!raw)
      return {
        ...result,
        entries: migrateLegacy(
          JSON.parse(storage.getItem("tcg-plans") || "{}"),
        ),
      };
    const value: unknown = JSON.parse(raw);
    try {
      return { ...result, entries: validateBackup(value).entries };
    } catch {
      if (object(value) && object(value.entries)) {
        for (const [id, entry] of Object.entries(value.entries)) {
          try {
            Object.assign(
              result.entries,
              validateBackup({ ...backup({}), entries: { [id]: entry } })
                .entries,
            );
          } catch {
            result.dropped++;
          }
        }
      }
    }
  } catch {
    /* Preserve the original even if JSON parsing fails. */
  }
  result.raw = raw;
  if (raw && storage.setItem) {
    try {
      const key = `${STORAGE_KEY}-corrupt-${Date.now()}`;
      storage.setItem(key, raw);
      result.recoveryKey = key;
    } catch {
      /* Saving stays locked until the original can be preserved. */
    }
  }
  result.error = `Saved pipeline needs recovery. Recovered ${Object.keys(result.entries).length} entries; dropped ${result.dropped} invalid entries. Automatic saving is paused. ${result.recoveryKey ? "The original is preserved on this device." : "Export the original before continuing."}`;
  return result;
}
export function stashBeforeReplace(
  entries: Entries,
  priority?: PriorityPreferences,
): string {
  const key = `${STORAGE_KEY}-before-replace-${Date.now()}`;
  localStorage.setItem(key, JSON.stringify(backup(entries, priority)));
  return key;
}
export function saveValue(key: string, value: unknown): string {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return "";
  } catch {
    return "Could not save on this device. Storage is unavailable or full. Export a JSON backup to keep your changes.";
  }
}
