import { useEffect, useState } from "react";
import { emptyFilters, type Filters } from "../model";
import { saveValue, stages } from "../storage";

export function stored(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}
export function normalizeFilters(value: unknown): Filters {
  const f = { ...emptyFilters };
  if (!value || typeof value !== "object" || Array.isArray(value)) return f;
  const v = value as Record<string, unknown>;
  for (const key of ["countries", "games"] as const)
    if (Array.isArray(v[key]))
      f[key] = [
        ...new Set(v[key].filter((s): s is string => typeof s === "string")),
      ];
  if (Array.isArray(v.stages))
    f.stages = v.stages.filter((s): s is Filters["stages"][number] =>
      stages.includes(s),
    );
  for (const [key, allowed] of [
    ["priority", ["any", "top", "high"]],
    ["size", ["", "S", "M", "L", "XL"]],
    ["status", ["", "confirmed", "estimated", "tba"]],
  ] as const) {
    if (
      typeof v[key] === "string" &&
      (allowed as readonly string[]).includes(v[key])
    )
      f[key] = v[key];
  }
  if (v.minTier === "must" || v.minTier === "strong") f.minTier = v.minTier;
  f.going = v.going === true;
  f.notGoing = !f.going && v.notGoing === true;
  f.next90 = v.next90 === true;
  if (typeof v.newOnly === "boolean") f.newOnly = v.newOnly;
  if (typeof v.tba === "boolean") f.tba = v.tba;
  if (typeof v.score === "number" && Number.isFinite(v.score))
    f.score = Math.max(0, Math.min(100, v.score));
  // Search and date ranges are session-only, including on upgrades from old storage.
  return f;
}
export function useFilters(reportError: (error: string) => void) {
  const [filters, setFilters] = useState(() =>
    normalizeFilters(stored("tcg-filters")),
  );
  useEffect(() => {
    const { search: _search, from: _from, to: _to, ...stable } = filters;
    const error = saveValue("tcg-filters", stable);
    if (error) reportError(error);
  }, [filters, reportError]);
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((f) => ({
      ...f,
      ...(key === "going" && value && { notGoing: false }),
      ...(key === "notGoing" && value && { going: false }),
      [key]: value,
    }));
  return { filters, setFilters, set };
}
