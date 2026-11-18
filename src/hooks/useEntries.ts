import { useCallback, useEffect, useState } from "react";
import {
  applyGoing,
  inverseGoingPatch,
  undoGoingPatch,
  backup,
  emptyEntry,
  loadEntries,
  saveValue,
  STORAGE_KEY,
  type Entries,
  type LoadedEntries,
} from "../storage";
import { download } from "../utils";

export function useEntries() {
  const [loaded] = useState<LoadedEntries>(() => {
    try {
      return loadEntries(localStorage);
    } catch {
      return {
        entries: {},
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
  const [{ entries, undo }, setState] = useState<{
    entries: Entries;
    undo: Undo | null;
  }>({
    entries: loaded.entries,
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
  useEffect(() => {
    if (!canSave) return;
    const error = saveValue(STORAGE_KEY, backup(entries));
    setSaved(!error);
    setStorageError(error);
  }, [entries, canSave]);
  const setGoing = useCallback((ids: readonly string[], going: boolean) => {
    const now = new Date().toISOString();
    setState((current) => {
      const next = applyGoing(current.entries, ids, going, now);
      const patch = inverseGoingPatch(current.entries, next, ids);
      return patch.length
        ? { entries: next, undo: { patch, going, changedAt: now } }
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
  function applyEntries(value: Entries) {
    setSaved(false);
    setState({ entries: value, undo: null });
  }
  return {
    entries,
    update,
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
