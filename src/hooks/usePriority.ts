import { useEffect, useMemo, useState } from "react";
import type { Event } from "../model";
import { normalizeWeights, scoreEvents } from "../scoring";
import {
  normalizeOverrides,
  OVERRIDES_KEY,
  WEIGHTS_KEY,
  saveValue,
} from "../storage";
import { stored } from "./useFilters";

export function usePriority(
  events: Event[],
  today: string,
  reportError: (message: string) => void,
) {
  const [weights, setWeights] = useState(() =>
    normalizeWeights(stored(WEIGHTS_KEY)),
  );
  const [overrides, setOverrides] = useState(() =>
    normalizeOverrides(stored(OVERRIDES_KEY)),
  );
  useEffect(() => {
    const error = saveValue(WEIGHTS_KEY, weights);
    if (error) reportError(error);
  }, [weights, reportError]);
  useEffect(() => {
    const error = saveValue(OVERRIDES_KEY, overrides);
    if (error) reportError(error);
  }, [overrides, reportError]);
  // Keep several open tabs in sync: adopt another tab's change, but only when
  // the content really differs, so two tabs never ping-pong writes.
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === WEIGHTS_KEY) {
        const next = normalizeWeights(stored(WEIGHTS_KEY));
        setWeights((cur) => (JSON.stringify(cur) === JSON.stringify(next) ? cur : next));
      } else if (event.key === OVERRIDES_KEY) {
        const next = normalizeOverrides(stored(OVERRIDES_KEY));
        setOverrides((cur) => (JSON.stringify(cur) === JSON.stringify(next) ? cur : next));
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const scores = useMemo(
    () =>
      Object.fromEntries(
        scoreEvents(events, { weights, overrides, today }).map((result) => [
          result.id,
          result,
        ]),
      ),
    [events, weights, overrides, today],
  );
  function setOverride(id: string, value: number | null) {
    setOverrides((current) => {
      if (value !== null) return { ...current, [id]: value };
      const next = { ...current };
      delete next[id];
      return next;
    });
  }
  return { weights, overrides, scores, setWeights, setOverrides, setOverride };
}
