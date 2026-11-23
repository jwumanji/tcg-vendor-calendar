import type { Event, EventDateRange } from "./model";
import { validDate } from "./data";
import { dateSortRange, occurrenceKey, overlappingDateRange } from "./utils";

export const MAX_COMPARE_PINS = 4;
export const COMPARE_PINS_KEY = "tcg-compare-pins-v1";

export type ComparePin = { id: string; occurrence?: string };

export function normalizeComparePins(value: unknown, events: readonly Event[]): ComparePin[] {
  if (!Array.isArray(value)) return [];
  const available = new Set(events.map(({ id }) => id));
  const pins: ComparePin[] = [];
  for (const pin of value as unknown[]) {
    if (!pin || typeof pin !== "object" || !("id" in pin) || typeof pin.id !== "string" || !available.delete(pin.id)) continue;
    const occurrence = "occurrence" in pin && typeof pin.occurrence === "string" ? pin.occurrence : undefined;
    const [start, end, extra] = occurrence?.split("/") ?? [];
    pins.push(validDate(start) && validDate(end) && start <= end && extra === undefined
      ? { id: pin.id, occurrence }
      : { id: pin.id });
    if (pins.length === MAX_COMPARE_PINS) break;
  }
  return pins;
}

export type CompareSelection = {
  pins: readonly ComparePin[];
  toggle: (event: Event) => void;
};

export function canCompare(pins: readonly unknown[]) {
  return pins.length >= 2 && pins.length <= MAX_COMPARE_PINS;
}

export function toggleComparePin(pins: ComparePin[], event: Event, today: string) {
  if (pins.some(({ id }) => id === event.id)) return pins.filter(({ id }) => id !== event.id);
  if (pins.length >= MAX_COMPARE_PINS) return pins;
  const displayed = event.date_status === "confirmed" && event.occurrences?.length ? dateSortRange(event, today) : undefined;
  return [...pins, { id: event.id, ...(displayed && { occurrence: occurrenceKey(displayed) }) }];
}

export function selectCompareOccurrence(pins: ComparePin[], id: string, occurrence: string) {
  return pins.map((pin) => pin.id === id ? { ...pin, occurrence } : pin);
}

export type PinnedEvent = {
  event: Event;
  occurrences: EventDateRange[];
  range?: EventDateRange;
  visible: boolean;
};

export function resolveComparePins(
  pins: readonly ComparePin[], allEvents: readonly Event[], season: readonly Event[],
  results: readonly Event[], today: string,
): PinnedEvent[] {
  if (!pins.length) return [];
  const publishedById = new Map(allEvents.map((event) => [event.id, event]));
  const seasonById = new Map(season.map((event) => [event.id, event]));
  const visibleIds = new Set(results.map(({ id }) => id));
  return pins.flatMap((pin) => {
    const published = publishedById.get(pin.id);
    if (!published) return [];
    const event = seasonById.get(pin.id) ?? published;
    const publishedDates = event.date_status === "confirmed" ? published.occurrences ?? [] : [];
    const occurrenceByKey = new Map(publishedDates.map((range) => [occurrenceKey(range), range]));
    const occurrences = [...occurrenceByKey.values()].sort((a, b) =>
      a.start_date.localeCompare(b.start_date) || a.end_date.localeCompare(b.end_date));
    const range = occurrenceByKey.get(pin.occurrence ?? "") ?? dateSortRange(event, today);
    return [{ event, occurrences, range, visible: visibleIds.has(pin.id) }];
  });
}

export function confirmedCompareRange({ event, range }: PinnedEvent) {
  return event.date_status === "confirmed" && !event.event_status ? range : undefined;
}

export function compareOverlaps(pinned: PinnedEvent, otherPins: readonly PinnedEvent[]) {
  const range = confirmedCompareRange(pinned);
  if (!range) return [];
  return otherPins.flatMap((other) => {
    if (other.event.id === pinned.event.id) return [];
    const otherRange = confirmedCompareRange(other);
    const overlap = otherRange && overlappingDateRange(range, otherRange);
    return overlap ? [{ event: other.event, overlap }] : [];
  });
}
