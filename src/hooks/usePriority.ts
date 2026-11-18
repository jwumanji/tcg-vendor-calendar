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
