import type { Event } from "./model";
import type { ScoreResult } from "./scoring";
import { emptyEntry, stages, type Entries } from "./storage";
import {
  compareText,
  dateSortKey,
  isUndated,
  prettyDate,
  ranges,
} from "./utils";

export const ROW_SORT_LABELS = {
  going: "Going",
  name: "Event",
  dates: "Dates",
  city: "Place",
  status: "Date status",
  priority: "Priority",
  scanner: "Scanner score",
  stage: "Stage",
  notes: "Notes",
  source: "Source",
};
export type RowKey = keyof typeof ROW_SORT_LABELS;
export type RowSort = { key: RowKey; direction: "asc" | "desc" };
export const defaultRowSort: RowSort = { key: "priority", direction: "desc" };
export function normalizeRowSort(input: unknown): RowSort {
  if (
    input &&
    typeof input === "object" &&
    "key" in input &&
    "direction" in input &&
    typeof input.key === "string" &&
    Object.hasOwn(ROW_SORT_LABELS, input.key) &&
    (input.direction === "asc" || input.direction === "desc")
  )
    return { key: input.key as RowKey, direction: input.direction };
  return defaultRowSort;
}
export function normalizeListView(input: unknown): "rows" | "grid" {
  return input === "grid" ? "grid" : "rows";
}
export function nextRowSort(sort: RowSort, key: RowKey): RowSort {
  if (key === sort.key)
    return { key, direction: sort.direction === "asc" ? "desc" : "asc" };
  return {
    key,
    direction:
      key === "priority" || key === "scanner" || key === "going"
        ? "desc"
        : "asc",
  };
}
export function rowDateLabel(e: Event, today: string) {
  if (e.date_status !== "confirmed") {
    return e.date_status === "estimated" && e.estimated_month
      ? "Est. " +
          new Date(e.estimated_month + "-01T12:00:00").toLocaleDateString(
            "en-GB",
            { month: "short", year: "numeric" },
          )
      : "TBA";
  }
  const start = dateSortKey(e, today);
  const end = ranges(e).find((r) => r.start_date === start)?.end_date;
  if (!end) return "TBA";
  if (start === end) return prettyDate(start);
  const left =
    start.slice(0, 7) === end.slice(0, 7)
      ? String(Number(start.slice(-2)))
      : start.slice(0, 4) === end.slice(0, 4)
        ? prettyDate(start).slice(0, -5)
        : prettyDate(start);
  return left + "–" + prettyDate(end);
}

export function sortRows(
  events: Event[],
  sort: RowSort,
  entries: Entries,
  scores: Record<string, Pick<ScoreResult, "score">>,
  today: string,
): Event[] {
  function value(e: Event): string | number | null {
    const entry = entries[e.id] || emptyEntry;
    switch (sort.key) {
      case "going":
        return Number(entry.going);
      case "name":
        return e.name;
      case "city":
        return e.city || e.country;
      case "dates": {
        if (e.date_status !== "confirmed")
          return e.date_status === "estimated" && e.estimated_month
            ? e.estimated_month + "-32"
            : null;
        const date = dateSortKey(e, today);
        return date === "9999" ? null : date;
      }
      case "status":
        return e.date_status;
      case "priority":
        return scores[e.id]?.score ?? null;
      case "scanner":
        return e.vendor_score;
      case "stage":
        return stages.indexOf(entry.stage);
      case "notes":
        return Number(Boolean(entry.note.trim()));
      case "source":
        return e.is_new_find ? e.source?.name || null : "Scanner";
    }
  }
  function compare(a: ReturnType<typeof value>, b: ReturnType<typeof value>) {
    if (a === null || b === null)
      return Number(a === null) - Number(b === null);
    const diff =
      typeof a === "number" && typeof b === "number"
        ? a - b
        : compareText(String(a), String(b));
    return sort.direction === "asc" ? diff : -diff;
  }
  return events
    .map((e) => ({ e, key: value(e) }))
    .sort(
      (a, b) =>
        compare(a.key, b.key) ||
        (sort.key === "city" ? compare(a.e.country, b.e.country) : 0),
    )
    .map((row) => row.e);
}

export const optionalColumns = ["scanner", "source", "notes"] as const;
export type OptionalColumn = (typeof optionalColumns)[number];
export function normalizeColumns(input: unknown): OptionalColumn[] {
  return optionalColumns.filter(
    (key) => Array.isArray(input) && input.includes(key),
  );
}

/** Preserve the current date sort (including direction) within and between months. */
export function groupRowsByMonth(sorted: Event[], today: string) {
  const months = new Map<string, Event[]>();
  const undated: Event[] = [];
  for (const event of sorted) {
    if (isUndated(event)) {
      undated.push(event);
      continue;
    }
    const month = dateSortKey(event, today).slice(0, 7);
    if (!months.has(month)) months.set(month, []);
    months.get(month)!.push(event);
  }
  if (undated.length) months.set("tba", undated);
  return months;
}

export function selectAllVisible(visible: readonly string[], checked: boolean) {
  return new Set(checked ? visible : []);
}

export function selectRange(
  visible: readonly string[],
  selected: ReadonlySet<string>,
  target: string,
  anchor: string | null,
) {
  const end = visible.indexOf(target);
  const start = anchor === null ? end : visible.indexOf(anchor);
  const next = new Set(visible.filter((id) => selected.has(id)));
  if (end < 0) return next;
  const checked = !selected.has(target);
  const from = start < 0 ? end : start;
  for (const id of visible.slice(
    Math.min(from, end),
    Math.max(from, end) + 1,
  )) {
    if (checked) next.add(id);
    else next.delete(id);
  }
  return next;
}
