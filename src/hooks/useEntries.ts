import { useCallback, useEffect, useState } from "react";
import {
  applyGoing,
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
  const [entries, setEntries] = useState(loaded.entries);
  const [storageError, setStorageError] = useState(loaded.error);
  const [saved, setSaved] = useState(false);
  const [canSave, setCanSave] = useState(!loaded.error);
  const update = useCallback(
    (id: string, field: "stage" | "note", value: string) => {
      setSaved(false);
      setEntries((current) => ({
        ...current,
        [id]: {
          ...(current[id] || emptyEntry),
          [field]: value,
          [field === "stage" ? "stageUpdatedAt" : "noteUpdatedAt"]:
            new Date().toISOString(),
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
    setSaved(false);
    setEntries((current) => applyGoing(current, ids, going, now));
  }, []);
  function acknowledgeRecovery() {
    if (!loaded.recoveryKey && loaded.raw)
      download(loaded.raw, "tcg-pipeline-original.json", "application/json");
    setStorageError("");
    setCanSave(true);
  }
  function applyEntries(value: Entries) {
    setSaved(false);
    setEntries(value);
  }
  return {
    entries,
    update,
    setGoing,
    applyEntries,
    saved,
    storageError,
    setStorageError,
    canSave,
    acknowledgeRecovery,
  };
}
