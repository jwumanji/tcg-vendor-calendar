import { normalizeWeights, type Weights } from "./scoring";
import { mergeMilestones, mergeVendorPricing, normalizeMilestones, normalizeOutreachPatch, normalizeVendorPricing, normalizeTripBudget, normalizeBudgetDefaults } from "./data";
import { findHomeBase } from "./homeBase";
import type { BudgetDefaults, Event, OutreachPatch, TripBudget, VendorMilestone, VendorPricingPatch } from "./model";

export const stages = [
  "Not reviewed",
  "Considering",
  "Contacted",
  "Quote received",
  "Applied",
  "Need to pay",
  "Booked",
  "Passed",
  "Too expensive",
] as const;
export type Stage = (typeof stages)[number];
const renamedStages: Record<string, Stage> = {
  New: "Not reviewed",
  Interested: "Considering",
  Pass: "Passed",
  "Paid / attending": "Booked",
};
export function normalizeStage(value: unknown): Stage | undefined {
  if (typeof value !== "string") return;
  if (Object.hasOwn(renamedStages, value)) return renamedStages[value];
  return stages.find((stage) => stage === value);
}
export interface Entry {
  going: boolean;
  goingUpdatedAt: string | null;
  stage: Stage;
  note: string;
  noteUpdatedAt: string | null;
  stageUpdatedAt: string | null;
  stageInferred?: true;
}
export type Entries = Record<string, Entry>;
export type DisplayEntry = Entry & { stageSuggested?: true };
export type OutreachPatches = Record<string, OutreachPatch>;
export type MilestoneEdits = Record<string, VendorMilestone[]>;
export type VendorPricingEdits = Record<string, VendorPricingPatch>;
export interface BudgetSettings {
  events: Record<string, TripBudget>;
  defaults?: BudgetDefaults;
}

export const emptyEntry: Entry = {
  going: false,
  goingUpdatedAt: null,
  stage: "Not reviewed",
  note: "",
  noteUpdatedAt: null,
  stageUpdatedAt: null,
};

type StageDecision = Pick<Entry, "stage" | "stageUpdatedAt" | "stageInferred">;
export type StageUndo = StageDecision & { id: string; changedAt: string };

function allowsStageSuggestion({ stage, stageUpdatedAt, stageInferred }: StageDecision) {
  return stage === emptyEntry.stage && (stageUpdatedAt === null || stageInferred === true);
}

function nextStageTimestamp(previous: string | null, now: string) {
  return previous === null || now > previous ? now : new Date(Date.parse(previous) + 1).toISOString();
}

function restoreStage(previous: StageDecision, changedAt: string, now: string): StageDecision {
  return {
    stage: previous.stage,
    stageUpdatedAt: nextStageTimestamp(changedAt, now),
    stageInferred: allowsStageSuggestion(previous) ? true : undefined,
  };
}

export function changeStage(entries: Entries, id: string, stage: Stage, now: string) {
  const entry = entries[id] ?? emptyEntry;
  const { stage: previousStage, stageUpdatedAt, stageInferred } = entry;
  const changedAt = nextStageTimestamp(stageUpdatedAt, now);
  const undo: StageUndo = { id, stage: previousStage, stageUpdatedAt, stageInferred, changedAt };
  return {
    entries: { ...entries, [id]: { ...entry, stage, stageUpdatedAt: changedAt, stageInferred: undefined } },
    undo,
  };
}

export function undoStagePatch(entries: Entries, patch: StageUndo, now: string): Entries {
  const { id, changedAt } = patch;
  const entry = entries[id];
  if (!entry || entry.stageUpdatedAt !== changedAt) return entries;
  return {
    ...entries,
    [id]: { ...entry, ...restoreStage(patch, changedAt, now) },
  };
}

function suggestedStage(event: Event): Stage | undefined {
  const outreach = event.outreach;
  if (outreach?.status === "declined") return "Passed";
  const organizerProposal = outreach?.status === "replied" &&
    event.vendor_documents?.some(({ kind }) => kind === "organizer_proposal");
  if (outreach?.status === "quoted" || outreach?.quoted_price?.trim() || organizerProposal ||
      event.vendor_options?.some(({ kind, basis, rate_status }) =>
        kind === "package" && basis === "quote" && rate_status !== "past_year"))
    return "Quote received";
  if (outreach?.status === "contacted" || outreach?.status === "replied") return "Contacted";
}

export type StageSuggestions = Partial<Record<string, Stage>>;
export function stageSuggestions(events: readonly Event[]): StageSuggestions {
  const suggestions: StageSuggestions = Object.create(null);
  for (const event of events) {
    const stage = suggestedStage(event);
    if (stage) suggestions[event.id] = stage;
  }
  return suggestions;
}

function decisionStage(entry: Entry, suggestion?: Stage): Stage {
  return allowsStageSuggestion(entry) && suggestion ? suggestion : entry.stage;
}

/** Suggestions stay derived so new evidence can update an untouched entry. */
export function withSuggestedStages(entries: Entries, suggestions: StageSuggestions): Record<string, DisplayEntry> {
  const result: Record<string, DisplayEntry> = Object.assign(Object.create(null), entries);
  for (const [id, suggestion] of Object.entries(suggestions)) {
    const entry = result[id] ?? emptyEntry;
    const stage = decisionStage(entry, suggestion);
    if (stage !== entry.stage) result[id] = { ...entry, stage, stageSuggested: true };
  }
  return result;
}

export function applyGoing(
  entries: Entries,
  ids: readonly string[],
  going: boolean,
  now: string,
  suggestions?: StageSuggestions,
): Entries {
  const next: Entries = Object.assign(Object.create(null), entries);
  for (const id of ids) {
    const entry = next[id] || emptyEntry;
    if (entry.going === going) continue;
    next[id] = {
      ...entry,
      going,
      goingUpdatedAt: now,
      ...(going &&
        decisionStage(entry, suggestions?.[id]) === emptyEntry.stage && {
          stage: "Considering", stageUpdatedAt: nextStageTimestamp(entry.stageUpdatedAt, now), stageInferred: undefined,
        }),
    };
  }
  return next;
}
type GoingInverse = {
  id: string;
  going: boolean;
  syncedStage?: StageDecision & { changedAt: string };
};
export function inverseGoingPatch(
  before: Entries,
  after: Entries,
  ids: readonly string[],
) {
  const patch: GoingInverse[] = [];
  for (const id of new Set(ids)) {
    const previous = before[id] || emptyEntry;
    const changed = after[id];
    if (changed && changed.going !== previous.going)
      patch.push({
        id,
        going: previous.going,
        ...(previous.stage !== changed.stage && changed.stageUpdatedAt && {
          syncedStage: {
            stage: previous.stage,
            stageUpdatedAt: previous.stageUpdatedAt,
            stageInferred: previous.stageInferred,
            changedAt: changed.stageUpdatedAt,
          },
        }),
      });
  }
  return patch;
}
export function undoGoingPatch(
  current: Entries,
  patch: GoingInverse[],
  changedAt: string,
  now: string,
): Entries {
  const next: Entries = { ...current };
  for (const { id, going, syncedStage } of patch) {
    const entry = current[id];
    if (entry?.goingUpdatedAt !== changedAt) continue;
    next[id] = {
      ...entry,
      going,
      goingUpdatedAt: now,
      ...(syncedStage &&
        entry.stage === "Considering" &&
        entry.stageUpdatedAt === syncedStage.changedAt && restoreStage(syncedStage, syncedStage.changedAt, now)),
    };
  }
  return next;
}
export const STORAGE_KEY = "tcg-pipeline-v1";
export const WEIGHTS_KEY = "tcg-priority-weights";
export const OVERRIDES_KEY = "tcg-priority-overrides";
export const HOME_BASE_KEY = "tcg-priority-home-base";
export const LIST_PREFERENCE_KEYS = {
  firstRunDismissed: "tcg-first-run-dismissed",
  deadlinesExpanded: "tcg-deadlines-expanded",
  followUpsExpanded: "tcg-follow-ups-expanded",
  showPast: "tcg-timeline-show-past",
} as const;
export type ListPreferences = Partial<Record<keyof typeof LIST_PREFERENCE_KEYS, boolean>>;
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
  homeBase?: string;
}
export interface Backup {
  listPreferences?: ListPreferences;
  priority?: PriorityPreferences;
  outreach?: OutreachPatches;
  milestones?: MilestoneEdits;
  vendorPricing?: VendorPricingEdits;
  tripBudget?: BudgetSettings;
  version: 1;
  exportedAt: string;
  entries: Entries;
}
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
function validateOutreachEntry(id: string, value: unknown): OutreachPatch {
  if (!id.trim()) throw new Error("Outreach ID must not be empty.");
  try {
    return normalizeOutreachPatch(value, true);
  } catch (error) {
    throw new Error(`Invalid outreach for ${id}. ${(error as Error).message}`);
  }
}
function validateMilestoneEntry(id: string, value: unknown): VendorMilestone[] {
  if (!id.trim()) throw new Error("Booking milestone event ID must not be empty.");
  try {
    return normalizeMilestones(value, true);
  } catch (error) {
    throw new Error(`Invalid booking milestone for ${id}. ${(error as Error).message}`);
  }
}
function validateBudgetEntry(id: string, value: unknown): TripBudget {
  if (!id.trim()) throw new Error("Trip budget event ID must not be empty.");
  try {
    return normalizeTripBudget(value);
  } catch (error) {
    throw new Error(`Invalid trip budget for ${id}. ${(error as Error).message}`);
  }
}
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
    const stage = normalizeStage(e.stage);
    if (!stage)
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
    if (e.stageInferred !== undefined && (e.stageInferred !== true || stage !== emptyEntry.stage))
      throw new Error(`Invalid entry ${id}: invalid inferred stage.`);
    if (e.going !== undefined && typeof e.going !== "boolean")
      throw new Error(`Invalid entry ${id}: going must be a boolean.`);
    if (e.goingUpdatedAt != null && !timestamp(e.goingUpdatedAt))
      throw new Error(`Invalid entry ${id}: invalid Going timestamp.`);
    entries[id] = {
      going: e.going === true,
      goingUpdatedAt: e.goingUpdatedAt ?? null,
      stage,
      note: e.note,
      noteUpdatedAt: e.noteUpdatedAt,
      stageUpdatedAt: e.stageUpdatedAt,
      ...(e.stageInferred === true && { stageInferred: true }),
    };
  }
  const result: Backup = { version: 1, exportedAt: value.exportedAt, entries };
  if (value.listPreferences !== undefined) {
    if (!object(value.listPreferences)) throw new Error("Invalid list preferences in backup.");
    const preferences = value.listPreferences;
    result.listPreferences = {};
    for (const key of Object.keys(LIST_PREFERENCE_KEYS) as (keyof ListPreferences)[]) {
      const setting = preferences[key];
      if (setting === undefined) continue;
      if (typeof setting !== "boolean") throw new Error("Invalid list preference in backup.");
      result.listPreferences[key] = setting;
    }
  }
  if (value.outreach !== undefined) {
    if (!object(value.outreach)) throw new Error("Invalid outreach in backup.");
    result.outreach = Object.assign(
      Object.create(null),
      Object.fromEntries(
        Object.entries(value.outreach).map(([id, patch]) => [id, validateOutreachEntry(id, patch)]),
      ),
    );
  }
  if (value.milestones !== undefined) {
    if (!object(value.milestones)) throw new Error("Invalid booking milestones in backup.");
    result.milestones = Object.fromEntries(
      Object.entries(value.milestones).map(([id, records]) => [id, validateMilestoneEntry(id, records)]),
    );
  }
  if (value.vendorPricing !== undefined) {
    if (!object(value.vendorPricing)) throw new Error("Invalid vendor pricing in backup.");
    result.vendorPricing = Object.fromEntries(Object.entries(value.vendorPricing).map(([id, patch]) => {
      if (!id.trim()) throw new Error("Vendor pricing event ID must not be empty.");
      try {
        return [id, normalizeVendorPricing(patch, true)];
      } catch (error) {
        throw new Error(`Invalid vendor pricing for ${id}. ${(error as Error).message}`);
      }
    }));
  }
  if (value.tripBudget !== undefined) {
    const tripBudget = value.tripBudget;
    if (!object(tripBudget) || !object(tripBudget.events))
      throw new Error("Invalid trip budgets in backup.");
    result.tripBudget = {
      events: Object.fromEntries(Object.entries(tripBudget.events).map(([id, budget]) => [id, validateBudgetEntry(id, budget)])),
      ...(tripBudget.defaults !== undefined && { defaults: normalizeBudgetDefaults(tripBudget.defaults) }),
    };
  }
  if (value.priority !== undefined) {
    if (
      !object(value.priority) ||
      !object(value.priority.weights) ||
      !object(value.priority.overrides)
    )
      throw new Error("Invalid priority settings in backup.");
    const homeBase = value.priority.homeBase;
    if (homeBase !== undefined && typeof homeBase !== "string")
      throw new Error("Invalid home base ID in backup.");
    result.priority = {
      weights: normalizeWeights(value.priority.weights),
      overrides: normalizeOverrides(value.priority.overrides),
      ...(homeBase !== undefined && { homeBase }),
    };
  }
  return result;
}
export function backup(
  entries: Entries,
  priority?: PriorityPreferences,
  outreach?: OutreachPatches,
  milestones?: MilestoneEdits,
  vendorPricing?: VendorPricingEdits,
  tripBudget?: BudgetSettings,
  listPreferences?: ListPreferences,
): Backup {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    entries,
    ...(priority && { priority }),
    ...(outreach && { outreach }),
    ...(milestones && { milestones }),
    ...(vendorPricing && { vendorPricing }),
    ...(tripBudget && { tripBudget }),
    ...(listPreferences && { listPreferences }),
  };
}
export function importPriority(
  current: PriorityPreferences,
  incoming: PriorityPreferences | undefined,
  mode: "merge" | "replace",
): PriorityPreferences {
  if (!incoming) return current;
  const homeBase = findHomeBase(incoming.homeBase)?.id ?? current.homeBase;
  return {
    weights: incoming.weights,
    overrides:
      mode === "merge"
        ? { ...current.overrides, ...incoming.overrides }
        : incoming.overrides,
    ...(homeBase !== undefined && { homeBase }),
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
    const going = (next.goingUpdatedAt || "") > (old.goingUpdatedAt || "");
    const stage = (next.stageUpdatedAt || "") > (old.stageUpdatedAt || "") ? next : old;
    const note = (next.noteUpdatedAt || "") > (old.noteUpdatedAt || "");
    result[id] = {
      going: going ? next.going : old.going,
      goingUpdatedAt: going ? next.goingUpdatedAt : old.goingUpdatedAt,
      stage: stage.stage,
      stageUpdatedAt: stage.stageUpdatedAt,
      ...(stage.stageInferred && { stageInferred: true }),
      note: note ? next.note : old.note,
      noteUpdatedAt: note ? next.noteUpdatedAt : old.noteUpdatedAt,
    };
  }
  return result;
}
export function importOutreach(
  current: OutreachPatches,
  incoming: OutreachPatches | undefined,
  mode: "merge" | "replace",
): OutreachPatches {
  if (!incoming) return current;
  if (mode === "replace") return incoming;
  const result: OutreachPatches = Object.assign(Object.create(null), current);
  for (const [id, patch] of Object.entries(incoming))
    result[id] = { ...result[id], ...patch };
  return result;
}
export function importMilestoneEdits(
  current: MilestoneEdits,
  incoming: MilestoneEdits | undefined,
  mode: "merge" | "replace",
): MilestoneEdits {
  if (!incoming) return current;
  if (mode === "replace") return incoming;
  const merged: MilestoneEdits = Object.assign(Object.create(null), current);
  for (const [id, records] of Object.entries(incoming))
    merged[id] = mergeMilestones(merged[id], records);
  return merged;
}

export function removeMilestoneEdit(edits: MilestoneEdits, eventId: string, milestoneId: string): MilestoneEdits {
  if (!Object.hasOwn(edits, eventId)) return edits;
  const records = edits[eventId];
  const remaining = records.filter((milestone) => milestone.id !== milestoneId);
  if (remaining.length === records.length) return edits;
  const next = { ...edits };
  if (remaining.length) next[eventId] = remaining;
  else delete next[eventId];
  return next;
}

export function importVendorPricing(
  current: VendorPricingEdits,
  incoming: VendorPricingEdits | undefined,
  mode: "merge" | "replace",
): VendorPricingEdits {
  if (!incoming) return current;
  if (mode === "replace") return incoming;
  const merged: VendorPricingEdits = Object.assign(Object.create(null), current);
  for (const [id, patch] of Object.entries(incoming)) merged[id] = mergeVendorPricing(merged[id], patch);
  return merged;
}

export function removeVendorPricingEdit(
  edits: VendorPricingEdits, eventId: string, field: keyof VendorPricingPatch, itemId: string,
): VendorPricingEdits {
  if (!Object.hasOwn(edits, eventId)) return edits;
  const patch = { ...edits[eventId] };
  const records = patch[field];
  const remaining = records?.filter(({ id }) => id !== itemId);
  if (!remaining || remaining.length === records?.length) return edits;
  delete patch[field];
  const next = { ...edits };
  if (remaining.length) next[eventId] = { ...patch, [field]: remaining };
  else if (Object.keys(patch).length) next[eventId] = patch;
  else delete next[eventId];
  return next;
}

export function importTripBudget(
  current: BudgetSettings,
  incoming: BudgetSettings | undefined,
  mode: "merge" | "replace",
): BudgetSettings {
  if (!incoming) return current;
  if (mode === "replace") return incoming;
  return { ...current, ...incoming, events: { ...current.events, ...incoming.events } };
}

export function unknownIds(
  entries: Entries,
  ids: string[],
  overrides: Record<string, number> = {},
  outreach: OutreachPatches = {},
  milestones: MilestoneEdits = {},
  vendorPricing: VendorPricingEdits = {},
  budgets: BudgetSettings["events"] = {},
) {
  const known = new Set(ids);
  return [
    ...new Set([...Object.keys(entries), ...Object.keys(overrides), ...Object.keys(outreach), ...Object.keys(milestones), ...Object.keys(vendorPricing), ...Object.keys(budgets)]),
  ].filter((id) => !known.has(id));
}
export function migrateLegacy(value: unknown): Entries {
  const result: Entries = Object.create(null);
  const plans: Record<string, Stage> = {
    "Planning to vend": "Considering",
    Accepted: "Need to pay",
    Skip: "Passed",
  };
  if (object(value))
    for (const [id, plan] of Object.entries(value)) {
      const stage = typeof plan === "string" && Object.hasOwn(plans, plan) ? plans[plan] : normalizeStage(plan);
      if (stage) result[id] = { ...emptyEntry, stage };
    }
  return result;
}
export interface LoadedEntries {
  entries: Entries;
  outreach: OutreachPatches;
  milestones: MilestoneEdits;
  vendorPricing: VendorPricingEdits;
  tripBudget: BudgetSettings;
  error: string;
  raw: string | null;
  recoveryKey: string | null;
  dropped: number;
}

export function hasLocalPlanning(
  id: string,
  { entries, outreach, milestones, vendorPricing, tripBudget }:
    Pick<LoadedEntries, "entries" | "outreach" | "milestones" | "vendorPricing" | "tripBudget">,
) {
  return [entries, outreach, milestones, vendorPricing, tripBudget.events].some((overlay) => Object.hasOwn(overlay, id));
}

export function loadEntries(
  storage: Pick<Storage, "getItem"> & Partial<Pick<Storage, "setItem">>,
): LoadedEntries {
  let raw: string | null = null;
  const result: LoadedEntries = {
    entries: Object.create(null),
    outreach: Object.create(null),
    milestones: Object.create(null),
    vendorPricing: Object.create(null),
    tripBudget: { events: Object.create(null) },
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
      const { entries, outreach = result.outreach, milestones = result.milestones,
        vendorPricing = result.vendorPricing, tripBudget = result.tripBudget } = validateBackup(value);
      return { ...result, entries, outreach, milestones, vendorPricing, tripBudget };
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
      if (object(value) && object(value.outreach)) {
        for (const [id, patch] of Object.entries(value.outreach)) {
          try {
            result.outreach[id] = validateOutreachEntry(id, patch);
          } catch {
            result.dropped++;
          }
        }
      }
      if (object(value) && object(value.milestones)) {
        for (const [id, records] of Object.entries(value.milestones)) {
          if (!id.trim() || !Array.isArray(records)) {
            result.dropped++;
            continue;
          }
          const recovered = normalizeMilestones(records);
          if (recovered.length) result.milestones[id] = recovered;
          result.dropped += records.length - recovered.length;
        }
      }
      if (object(value) && value.tripBudget !== undefined) {
        const storedBudget = value.tripBudget;
        if (object(storedBudget) && object(storedBudget.events)) {
          for (const [id, budget] of Object.entries(storedBudget.events)) {
            try {
              result.tripBudget.events[id] = validateBudgetEntry(id, budget);
            } catch {
              result.dropped++;
              if (!object(budget) || budget.contributionMarginBps === undefined) continue;
              const { contributionMarginBps: _margin, ...remainingBudget } = budget;
              try {
                const recovered = validateBudgetEntry(id, remainingBudget);
                if (Object.keys(recovered).length) result.tripBudget.events[id] = recovered;
              } catch {
                // The budget still contains invalid data without the margin.
              }
            }
          }
          if (storedBudget.defaults !== undefined) {
            try {
              result.tripBudget.defaults = normalizeBudgetDefaults(storedBudget.defaults);
            } catch {
              result.dropped++;
            }
          }
        } else result.dropped++;
      }
      if (object(value) && object(value.vendorPricing)) {
        for (const [id, patch] of Object.entries(value.vendorPricing)) {
          if (!id.trim() || !object(patch)) {
            result.dropped++;
            continue;
          }
          const recovered = normalizeVendorPricing(patch);
          for (const field of ["vendor_options", "vendor_documents"] as const) {
            const records = patch[field];
            if (records !== undefined)
              result.dropped += Array.isArray(records) ? records.length - (recovered[field]?.length ?? 0) : 1;
          }
          if (Object.keys(recovered).length) result.vendorPricing[id] = recovered;
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
  const recovered = Object.keys(result.entries).length + Object.keys(result.outreach).length +
    Object.keys(result.milestones).length + Object.keys(result.vendorPricing).length +
    Object.keys(result.tripBudget.events).length + Number(result.tripBudget.defaults !== undefined);
  result.error = `Saved planner data needs recovery. Recovered ${recovered} saved records. Dropped ${result.dropped} invalid records or fields. Automatic saving is paused. ${result.recoveryKey ? "The original is preserved on this device." : "Export the original before continuing."}`;
  return result;
}
export function stashBeforeReplace(
  entries: Entries,
  priority?: PriorityPreferences,
  outreach?: OutreachPatches,
  milestones?: MilestoneEdits,
  vendorPricing?: VendorPricingEdits,
  tripBudget?: BudgetSettings,
  listPreferences?: ListPreferences,
): string {
  const key = `${STORAGE_KEY}-before-replace-${Date.now()}`;
  localStorage.setItem(key, JSON.stringify(backup(entries, priority, outreach, milestones, vendorPricing, tripBudget, listPreferences)));
  return key;
}
export function saveValue(key: string, value: unknown): string {
  try {
    if (value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
    return "";
  } catch {
    return "Could not save on this device. Storage is unavailable or full. Export a JSON backup to keep your changes.";
  }
}
