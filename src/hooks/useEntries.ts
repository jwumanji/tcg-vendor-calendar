import { useCallback, useEffect, useState } from "react";
import {
  applyGoing,
  inverseGoingPatch,
  undoGoingPatch,
  backup,
  emptyEntry,
  loadEntries,
  removeMilestoneEdit,
  saveValue,
  STORAGE_KEY,
  type Entries,
  type LoadedEntries,
  type MilestoneEdits,
  type OutreachPatches,
} from "../storage";
import type { Outreach, OutreachPatch, VendorMilestone } from "../model";
import { mergeMilestones, reconcileOutreachOverlay } from "../data";
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
        error: "Storage is unavailable. Export a backup to keep changes.",
        raw: null,
        recoveryKey: null,
        dropped: 0,
      };
    }
  });
  type Undo = {
    going: boolean;
    patch: ReturnType<typeof inverseGoingPatch>;
    changedAt: string;
  };
  const [{ entries, outreach, milestones, undo }, setState] = useState<{
    entries: Entries;
    outreach: OutreachPatches;
    milestones: MilestoneEdits;
    undo: Undo | null;
  }>({
    entries: loaded.entries,
    outreach: loaded.outreach,
    milestones: loaded.milestones,
    undo: null,
  });
  const [storageError, setStorageError] = useState(loaded.error);
  const [saved, setSaved] = useState(false);
  const [canSave, setCanSave] = useState(!loaded.error);
  const update = useCallback(
    (id: string, field: "stage" | "note", value: string) => {
      setSaved(false);
      const now = new Date().toISOString();
      setState((current) => ({
        ...current,
        entries: {
          ...current.entries,
          [id]: {
            ...(current.entries[id] || emptyEntry),
            [field]: value,
            [field === "stage" ? "stageUpdatedAt" : "noteUpdatedAt"]: now,
          },
        },
      }));
    },
    [],
  );
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
  useEffect(() => {
    if (!canSave) return;
    const error = saveValue(STORAGE_KEY, backup(entries, undefined, outreach, milestones));
    setSaved(!error);
    setStorageError(error);
  }, [entries, outreach, milestones, canSave]);
  const setGoing = useCallback((ids: readonly string[], going: boolean) => {
    const now = new Date().toISOString();
    setState((current) => {
      const next = applyGoing(current.entries, ids, going, now);
      const patch = inverseGoingPatch(current.entries, next, ids);
      return patch.length
        ? { ...current, entries: next, undo: { patch, going, changedAt: now } }
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
  function undoGoing() {
    const now = new Date().toISOString();
    setState((current) => {
      if (!current.undo) return current;
      return {
        ...current,
        entries: undoGoingPatch(
          current.entries,
          current.undo.patch,
          current.undo.changedAt,
          now,
        ),
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
  function applyEntries(entries: Entries, outreach: OutreachPatches, milestones: MilestoneEdits) {
    setSaved(false);
    setState({ entries, outreach, milestones, undo: null });
  }
  return {
    entries,
    outreach,
    milestones,
    update,
    updateOutreach,
    updateMilestone,
    resetMilestone,
    undo,
    undoGoing,
    setGoing,
    applyEntries,
    saved,
    storageError,
    setStorageError,
    canSave,
    acknowledgeRecovery,
  };
}
