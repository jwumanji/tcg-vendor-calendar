import type { Event } from "../src/model.ts";
import { listingKey } from "./listing.ts";
import { slug } from "./normalize.ts";
import { fold } from "./relevance.ts";

const day = 86_400_000;
const stamp = (s: string) => Date.parse(s + "T00:00:00Z");
function tokens(s: string) {
  // Suntec's description calls its Arca listing "Nexus TCG Tradeshow".
  return new Set(
    fold(s)
      .replace(/nexus collectibles arca/g, "nexus tradeshow")
      .replace(/\bcardshow\b/g, "card show")
      .replace(/comic-con/g, "comic con")
      .replace(/\b(volume|vol)\.?\s*\d+/g, " ")
      .replace(/\b(?:20\d\d|edition|the|by|in|and|at|of)\b/g, " ")
      .match(/[\p{L}\d]+/gu) ?? [],
  );
}
function similar(a: string, b: string) {
  const x = tokens(a),
    y = tokens(b);
  const common = [...x].filter((t) => y.has(t)).length;
  if (!common) return false;
  const min = Math.min(x.size, y.size);
  return (
    (common === x.size && common === y.size) ||
    common / (x.size + y.size - common) >= 0.68 ||
    (common === min &&
      min >= 2 &&
      [...x].some(
        (t) =>
          y.has(t) &&
          ![
            "card",
            "show",
            "comic",
            "con",
            "expo",
            "games",
            "fest",
            "trading",
          ].includes(t),
      ))
  );
}
function ranges(e: Event) {
  return e.occurrences?.length
    ? e.occurrences
    : e.start_date
      ? [{ start_date: e.start_date, end_date: e.end_date ?? e.start_date }]
      : [];
}
function nearby(a: Event, b: Event) {
  const ar = ranges(a),
    br = ranges(b);
  if (ar.length && br.length)
    return ar.some((x) =>
      br.some(
        (y) =>
          stamp(x.start_date) <= stamp(y.end_date) + 3 * day &&
          stamp(y.start_date) <= stamp(x.end_date) + 3 * day,
      ),
    );
  const months = (e: Event) =>
    [
      e.estimated_month,
      ...ranges(e).flatMap((r) => [
        r.start_date.slice(0, 7),
        r.end_date.slice(0, 7),
      ]),
    ].filter(Boolean);
  return months(a).some((m) => months(b).includes(m));
}
export function matches(a: Event, b: Event) {
  const city = (e: Event) =>
    fold(e.city ?? "")
      .replace(/\s*\(.*|,.*$/g, "")
      .trim();
  if (
    (a.country_code && b.country_code && a.country_code !== b.country_code) ||
    (a.country && b.country && fold(a.country) !== fold(b.country)) ||
    (city(a) && city(b) && city(a) !== city(b))
  )
    return false;
  if (!nearby(a, b)) return false;
  if (similar(a.name, b.name)) return true;
  // Venue listings often append a parenthetical subtitle and organisers append
  // the host city. Compare the main title too, once location and dates agree.
  const mainTitle = (e: Event) =>
    fold(e.name)
      .split("(")[0]
      .replaceAll(city(e) || "\u0000", " ")
      .trim();
  return similar(mainTitle(a), mainTitle(b));
}
export function merge(
  existing: Event[],
  incoming: Event[],
  today: string,
  imported?: Event[],
  sourceOrder: readonly string[] = [],
  notices: Event[] = [],
) {
  const rank = (id: string) => {
    const index = sourceOrder.indexOf(id);
    return index === -1 ? Infinity : index;
  };
  const existingById = new Map(existing.map((event) => [event.id, event]));
  const scanner: Event[] = imported?.map(({ outreach: _importedOutreach, ...event }) => {
    const outreach = existingById.get(event.id)?.outreach;
    return outreach === undefined ? event : { ...event, outreach };
  }) ?? existing.filter((e) => !e.source);
  const old = existing.filter((e) => e.source);
  const retained = old.filter(
    (e) => !scanner.some((s) => s.id === e.id || matches(s, e)),
  );
  const keys = new Map<string, number>();
  for (const e of [...incoming, ...notices]) {
    const key = listingKey(e);
    if (key) keys.set(key, (keys.get(key) ?? 0) + 1);
  }
  function stableIndex(event: Event) {
    const key = listingKey(event);
    if (!key || keys.get(key) !== 1) return -1;
    const first = retained.findIndex((e) => listingKey(e) === key);
    return first >= 0 && !retained.slice(first + 1).some((e) => listingKey(e) === key)
      ? first : -1;
  }
  function compatibleListing(a: Event, b: Event) {
    if (a.source!.id !== b.source!.id) return true;
    const x = listingKey(a), y = listingKey(b);
    return !x || !y || x === y;
  }
  const newIds = new Set<string>();
  const known: Record<string, number> = {};
  for (const event of incoming) {
    const owner = event.source!.id;
    const scannerMatch = scanner.some(
      (s) => s.id === event.id || matches(s, event),
    );
    let i = stableIndex(event);
    if (i < 0) i = retained.findIndex((e) =>
      compatibleListing(e, event) && (
        matches(e, event) ||
        (e.source!.id === owner &&
          e.name === event.name &&
          e.city === event.city &&
          e.country_code === event.country_code &&
          (!e.start_date || !event.start_date) &&
          (!e.estimated_month || !event.estimated_month || e.estimated_month === event.estimated_month) &&
          (e.date_status === "tba" || event.date_status === "tba" || e.id === event.id))
      ),
    );
    if (scannerMatch || i >= 0) known[owner] = (known[owner] ?? 0) + 1;
    if (scannerMatch) continue;
    if (i >= 0) {
      const earlier = retained[i];
      const oldOwner = earlier.source!.id;
      if (oldOwner === owner || rank(owner) < rank(oldOwner)) {
        const { outreach, ...update } = event;
        retained[i] = {
          ...earlier,
          ...update,
          ...(outreach != null && { outreach }),
          id: earlier.id,
          source: {
            ...event.source!,
            discovered_at: earlier.source!.discovered_at,
          },
        };
      }
    } else {
      // A recurring show can list two different weekends in the same month.
      // Keep the first identity and qualify a colliding slug using the listing.
      let id = event.id;
      if (retained.some((e) => e.id === id)) {
        const edition = slug([event.country_code, event.city, event.start_date?.slice(-2)]
          .filter(Boolean).join(" "));
        const suffix = id.lastIndexOf("-");
        const qualified = id.slice(0, suffix) + "-" + edition + id.slice(suffix);
        id = qualified;
        for (let n = 2; retained.some((e) => e.id === id) || scanner.some((e) => e.id === id); n++)
          id = qualified + "-" + n;
      }
      retained.push({ ...event, id });
      newIds.add(id);
    }
  }
  for (const notice of notices) {
    let i = stableIndex(notice);
    if (i < 0) {
      const candidates = retained.filter((e) => e.source!.id === notice.source!.id &&
        compatibleListing(e, notice) && e.name === notice.name && e.city === notice.city &&
        e.country_code === notice.country_code && notice.start_date && e.start_date === notice.start_date);
      if (candidates.length === 1) i = retained.indexOf(candidates[0]);
    }
    if (i < 0 || newIds.has(retained[i].id)) continue;
    const earlier = retained[i];
    retained[i] = {
      ...earlier, date_status: "tba", section: "watchlist", date_note: notice.date_note,
      start_date: null, end_date: null, estimated_month: null,
      source: { ...earlier.source!, confidence: 0.5 },
    };
    delete retained[i].occurrences;
    known[notice.source!.id] = (known[notice.source!.id] ?? 0) + 1;
  }
  // Apply the grace period after reconciliation: a newly rescheduled show
  // may have been discovered more than thirty days after its original date.
  const active = retained.filter((e) => !e.end_date || stamp(today) - stamp(e.end_date) <= 30 * day);
  // Insert finds chronologically within the export sections; preserve the original
  // order of all Scanner records, including its manually positioned TBA entries.
  const section = { timeline: 0, recurring_sg: 1, watchlist: 2 };
  const key = (e: Event) =>
    e.start_date ?? (e.estimated_month ? e.estimated_month + "-15" : "9999");
  const ordered = [...scanner];
  for (const e of active.sort(
    (a, b) => key(a).localeCompare(key(b)) || a.id.localeCompare(b.id),
  )) {
    const index = ordered.findIndex(
      (other) =>
        section[other.section] > section[e.section] ||
        (other.section === e.section &&
          (other.start_date || other.estimated_month) &&
          key(other) > key(e)),
    );
    ordered.splice(index < 0 ? ordered.length : index, 0, e);
  }
  return {
    events: ordered,
    added: ordered.filter((e) => newIds.has(e.id)),
    known,
    removed: old.length - active.filter((e) => !newIds.has(e.id)).length,
  };
}
