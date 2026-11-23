import { useCallback, useEffect, useState } from "react";
import {
  applyGoing,
  changeStage,
  inverseGoingPatch,
  undoGoingPatch,
  undoStagePatch,
  backup,
  emptyEntry,
  loadEntries,
  removeMilestoneEdit,
  removeVendorPricingEdit,
  saveValue,
  STORAGE_KEY,
  type BudgetSettings,
  type Entries,
  type LoadedEntries,
  type MilestoneEdits,
  type OutreachPatches,
  type StageSuggestions,
  type Stage,
  type StageUndo,
  type VendorPricingEdits,
} from "../storage";
import type { BudgetDefaults, TripBudget, Outreach, OutreachPatch, VendorMilestone, VendorPricingPatch } from "../model";
import { mergeMilestones, mergeVendorPricing, reconcileOutreachOverlay } from "../data";
import { download } from "../utils";

export function useEntries() {
  const [loaded] = useState<LoadedEntries>(() => {
    try {
      return loadEntries(localStorage);
    } catch {
      return {
        entries: {},
        outreach: {},
        milestones: {},
        vendorPricing: {},
        tripBudget: { events: {} },
        error: "Storage is unavailable. Export a backup to keep changes.",
        raw: null,
        recoveryKey: null,
        dropped: 0,
      };
    }
  });
  type Undo = { kind: "stage"; name: string; stage: Stage; patch: StageUndo; changedAt: string } | {
    kind: "going";
    going: boolean;
    patch: ReturnType<typeof inverseGoingPatch>;
    changedAt: string;
  };
  const [{ entries, outreach, milestones, vendorPricing, tripBudget, undo }, setState] = useState<{
    entries: Entries;
    outreach: OutreachPatches;
    milestones: MilestoneEdits;
    vendorPricing: VendorPricingEdits;
    tripBudget: BudgetSettings;
    undo: Undo | null;
  }>({
    entries: loaded.entries,
    outreach: loaded.outreach,
    milestones: loaded.milestones,
    vendorPricing: loaded.vendorPricing,
    tripBudget: loaded.tripBudget,
    undo: null,
  });
  const [storageError, setStorageError] = useState(loaded.error);
  const [saved, setSaved] = useState(false);
  const [canSave, setCanSave] = useState(!loaded.error);
  const update = useCallback(
    (id: string, note: string) => {
      setSaved(false);
      const now = new Date().toISOString();
      setState((current) => ({
        ...current,
        entries: {
          ...current.entries,
          [id]: {
            ...(current.entries[id] || emptyEntry),
            note,
            noteUpdatedAt: now,
          },
        },
      }));
    },
    [],
  );
  const updateStage = useCallback((id: string, name: string, stage: Stage) => {
    setSaved(false);
    const now = new Date().toISOString();
    setState((current) => {
      const { entries, undo } = changeStage(current.entries, id, stage, now);
      return { ...current, entries, undo: { kind: "stage", name, stage, patch: undo, changedAt: now } };
    });
  }, []);
  const updateOutreach = useCallback((id: string, patch: OutreachPatch, shared?: Outreach | null) => {
    setSaved(false);
    setState((current) => ({
      ...current,
      outreach: {
        ...current.outreach,
        [id]: { ...reconcileOutreachOverlay(shared, current.outreach[id]), ...patch },
      },
    }));
  }, []);
  const updateMilestone = useCallback((id: string, milestone: VendorMilestone) => {
    setSaved(false);
    setState((current) => ({
      ...current,
      milestones: {
        ...current.milestones,
        [id]: mergeMilestones(
          Object.hasOwn(current.milestones, id) ? current.milestones[id] : undefined,
          [milestone],
        ),
      },
    }));
  }, []);
  const resetMilestone = useCallback((id: string, milestoneId: string) => {
    setSaved(false);
    setState((current) => ({
      ...current,
      milestones: removeMilestoneEdit(current.milestones, id, milestoneId),
    }));
  }, []);
  const updateVendorPricing = useCallback((id: string, patch: VendorPricingPatch) => {
    setSaved(false);
    setState((current) => ({
      ...current,
      vendorPricing: {
        ...current.vendorPricing,
        [id]: mergeVendorPricing(Object.hasOwn(current.vendorPricing, id) ? current.vendorPricing[id] : undefined, patch),
      },
    }));
  }, []);
  const resetVendorPricing = useCallback((id: string, field: keyof VendorPricingPatch, itemId: string) => {
    setSaved(false);
    setState((current) => ({
      ...current,
      vendorPricing: removeVendorPricingEdit(current.vendorPricing, id, field, itemId),
    }));
  }, []);
  const updateTripBudget = useCallback((id: string, budget?: TripBudget) => {
    setSaved(false);
    setState((current) => {
      const events: BudgetSettings["events"] = Object.assign(Object.create(null), current.tripBudget.events);
      if (budget) events[id] = budget;
      else delete events[id];
      return { ...current, tripBudget: { ...current.tripBudget, events } };
    });
  }, []);
  const updateBudgetDefaults = useCallback((defaults: BudgetDefaults) => {
    setSaved(false);
    setState((current) => ({ ...current, tripBudget: { ...current.tripBudget, defaults } }));
  }, []);
  useEffect(() => {
    if (!canSave) return;
    const error = saveValue(STORAGE_KEY, backup(entries, undefined, outreach, milestones, vendorPricing, tripBudget));
    setSaved(!error);
    setStorageError(error);
  }, [entries, outreach, milestones, vendorPricing, tripBudget, canSave]);
  const setGoing = useCallback((ids: readonly string[], going: boolean, suggestions?: StageSuggestions) => {
    const now = new Date().toISOString();
    setState((current) => {
      const next = applyGoing(current.entries, ids, going, now, suggestions);
      const patch = inverseGoingPatch(current.entries, next, ids);
      return patch.length
        ? { ...current, entries: next, undo: { kind: "going", patch, going, changedAt: now } }
        : current;
    });
  }, []);
  useEffect(() => {
    if (!undo) return;
    const timer = window.setTimeout(
      () =>
        setState((current) =>
          current.undo === undo ? { ...current, undo: null } : current,
        ),
      8000,
    );
    return () => window.clearTimeout(timer);
  }, [undo]);
  function undoChange() {
    const now = new Date().toISOString();
    setState((current) => {
      if (!current.undo) return current;
      return {
        ...current,
        entries: current.undo.kind === "stage"
          ? undoStagePatch(current.entries, current.undo.patch, now)
          : undoGoingPatch(current.entries, current.undo.patch, current.undo.changedAt, now),
        undo: null,
      };
    });
  }
  function acknowledgeRecovery() {
    if (!loaded.recoveryKey && loaded.raw)
      download(loaded.raw, "tcg-pipeline-original.json", "application/json");
    setStorageError("");
    setCanSave(true);
  }
  function applyEntries(entries: Entries, outreach: OutreachPatches, milestones: MilestoneEdits, vendorPricing: VendorPricingEdits, tripBudget: BudgetSettings) {
    setSaved(false);
    setState({ entries, outreach, milestones, vendorPricing, tripBudget, undo: null });
  }
  return {
    entries,
    outreach,
    milestones,
    vendorPricing,
    tripBudget,
    updateTripBudget,
    updateBudgetDefaults,
    updateVendorPricing,
    resetVendorPricing,
    update,
    updateStage,
    updateOutreach,
    updateMilestone,
    resetMilestone,
    undo,
    undoChange,
    setGoing,
    applyEntries,
    saved,
    storageError,
    setStorageError,
    canSave,
    acknowledgeRecovery,
  };
}
