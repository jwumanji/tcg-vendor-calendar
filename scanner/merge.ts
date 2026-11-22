import type { Event } from "../src/model.ts";
import { mergeMilestones, mergeVendorPricing } from "../src/data.ts";
import { listingKey, type Notice } from "./listing.ts";
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
const city = (e: Event) => fold(e.city ?? "").replace(/\s*\(.*|,.*$/g, "").trim();

function sameLocation(a: Event, b: Event) {
  return !(
    (a.country_code && b.country_code && a.country_code !== b.country_code) ||
    (a.country && b.country && fold(a.country) !== fold(b.country)) ||
    (city(a) && city(b) && city(a) !== city(b))
  );
}

function similarTitles(a: Event, b: Event) {
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

export function matches(a: Event, b: Event) {
  return sameLocation(a, b) && nearby(a, b) && similarTitles(a, b);
}

function scannerReschedule(old: Event, next: Event) {
  if (!city(old) || city(old) !== city(next) || !sameLocation(old, next)) return false;
  if ([old, next].some((event) => event.section === "recurring_sg" || event.occurrences?.length)) return false;
  const edition = (event: Event) => event.name.match(/\b\d+\b/g)?.join(" ");
  const previousEdition = edition(old), nextEdition = edition(next);
  if (previousEdition && nextEdition && previousEdition !== nextEdition) return false;
  const oldStart = old.start_date ?? (old.estimated_month && old.estimated_month + "-15");
  const nextStart = next.start_date ?? (next.estimated_month && next.estimated_month + "-15");
  const movedWithinSeason = oldStart && nextStart && Math.abs(stamp(oldStart) - stamp(nextStart)) <= 90 * day;
  if (similarTitles(old, next) && (movedWithinSeason || (previousEdition && previousEdition === nextEdition))) return true;
  // Dedicated listing links can corroborate a larger move or a rewritten title.
  return [old.website, ...old.source_urls].some((link) => {
    if (!link || !URL.canParse(link)) return false;
    const url = new URL(link);
    return /\b20\d\d\b/.test(url.pathname) && (next.website === link || next.source_urls.includes(link));
  });
}

function historicalRanges(e: Event) {
  return e.source?.previous_dates ?? e.source?.original_dates ?? [];
}
function sameRange(a: { start_date: string; end_date: string }, b: typeof a) {
  return a.start_date === b.start_date && a.end_date === b.end_date;
}
function sourceHistory(old: Event, next: Event, listing = next) {
  const superseded = ranges(old).filter((r) => !ranges(next).some((n) => sameRange(n, r)));
  const history = [...historicalRanges(old).filter((r) => !superseded.some((s) => sameRange(s, r))), ...superseded];
  const aliases = new Set(old.source?.aliases);
  for (const key of [listingKey(old), listingKey(listing)]) {
    if (key) aliases.add(key);
  }
  return {
    ...(history.length && {
      original_dates: old.source?.original_dates?.length ? old.source.original_dates : superseded.length ? superseded : [history[0]],
      previous_dates: history,
    }),
    ...(aliases.size && { aliases: [...aliases] }),
  };
}

// Scanner exports may drop weekends or move one. Match unchanged starts first.
// Carry a moved weekend's UID only when exactly one old and new range remain.
function calendarIdentity(old: Event, next: Event): Partial<Event> {
  if (!next.occurrences?.length) {
    const original = old.original_start_date ?? old.source?.original_dates?.[0]?.start_date ?? historicalRanges(old)[0]?.start_date ?? old.start_date;
    return original && original !== next.start_date ? { original_start_date: original } : {};
  }
  const previous = old.occurrences ?? [];
  const missing = previous.filter((r) => !next.occurrences!.some((n) => n.start_date === r.start_date));
  const added = next.occurrences.filter((r) => !previous.some((p) => p.start_date === r.start_date));
  return { occurrences: next.occurrences.map((r) => {
    const match = previous.find((p) => p.start_date === r.start_date) ??
      (missing.length === 1 && added.length === 1 ? missing[0] : undefined);
    return { ...r, original_start_date: match?.original_start_date ?? r.original_start_date ?? match?.start_date ?? r.start_date };
  }) };
}

function hasSharedPlanning(event: Event) {
  return Boolean(event.outreach || event.vendor_milestones?.length ||
    event.vendor_options?.length || event.vendor_documents?.length || event.trip_budget);
}

function preserveMilestones(previous: Event, next: Event): Partial<Event> {
  if (!previous.vendor_milestones?.length) return {};
  return {
    vendor_milestones: mergeMilestones(next.vendor_milestones, previous.vendor_milestones),
    vendor_deadline: previous.vendor_deadline ?? next.vendor_deadline,
  };
}

function refreshVendorPricing(previous: Event, next: Event) {
  const pricing = mergeVendorPricing(next, previous);
  const published = new Map(next.vendor_options?.filter((option) => option.basis === "published")
    .map((option) => [option.id, option]));
  if (pricing.vendor_options) {
    pricing.vendor_options = pricing.vendor_options.map((option) => {
      const update = published.get(option.id);
      return option.basis === "published" && update
        ? { ...update, eligibility: option.eligibility, notes: option.notes || update.notes }
        : option;
    });
  }
  return pricing;
}

function reconcileScanner(existing: Event[], imported: Event[]) {
  const byId = new Map(existing.map((event) => [event.id, event]));
  const byExportId = new Map(
    existing.flatMap((event) => event.scanner_export_id
      ? [[event.scanner_export_id, event] as const]
      : []),
  );
  const importedIds = new Set(imported.map((event) => event.id));
  const matched = imported.map((event) => {
    const alias = byExportId.get(event.id);
    return byId.get(event.id) ?? (alias && !importedIds.has(alias.id) ? alias : undefined);
  });
  const used = new Set(matched.filter(Boolean));
  const unmatched = existing.filter((event) => !used.has(event) && (!event.source || hasSharedPlanning(event)));
  const candidates = imported.map((event, index) => {
    if (matched[index]) return [];
    const near = unmatched.filter((old) => matches(event, old));
    const activeNear = near.filter((old) => !old.scanner_archived);
    if (activeNear.length) return activeNear;
    const moved = unmatched.filter((old) => !old.scanner_archived && scannerReschedule(old, event));
    return moved.length ? moved : near;
  });
  const scanner = imported.map<Event>(({ outreach: _outreach, scanner_export_id: _exportId,
    scanner_archived: _archived, ...event }, index) => {
    const [candidate] = candidates[index];
    // Keep the planner ID so event links, seed log entries and local patches still resolve.
    const previous = matched[index] ?? (
      candidates[index].length === 1 &&
      !candidates.some((rows, other) => other !== index && rows.includes(candidate))
        ? candidate : undefined
    );
    if (!previous) return event;
    used.add(previous);
    return {
      ...event,
      ...calendarIdentity(previous, event),
      ...preserveMilestones(previous, event),
      ...refreshVendorPricing(previous, event),
      ...(previous.trip_budget && { trip_budget: previous.trip_budget }),
      ...(previous.id !== event.id && { id: previous.id, scanner_export_id: event.id }),
      ...(previous.outreach !== undefined && { outreach: previous.outreach }),
    };
  });
  return {
    scanner: [...scanner, ...unmatched.filter((event) => !event.source && hasSharedPlanning(event) && !used.has(event))],
    old: existing.filter((event) => event.source && !used.has(event)),
  };
}

export function merge(
  existing: Event[],
  incoming: Event[],
  today: string,
  imported?: Event[],
  sourceOrder: readonly string[] = [],
  notices: Notice[] = [],
) {
  const rank = (id: string) => {
    const index = sourceOrder.indexOf(id);
    return index === -1 ? Infinity : index;
  };
  const { scanner, old } = imported ? reconcileScanner(existing, imported) : {
    scanner: existing.filter((e) => !e.source && !e.scanner_archived),
    old: existing.filter((e) => e.source),
  };
  const retained = old.filter(
    (e) => hasSharedPlanning(e) || !scanner.some((s) => s.id === e.id || matches(s, e)),
  );
  function samePlace(a: Event, b: Event) {
    return (!a.city || !b.city || fold(a.city) === fold(b.city)) &&
      (!a.country_code || !b.country_code || a.country_code === b.country_code);
  }
  const snapshot = retained.slice();
  const editionRanges = (e: Event) => [...ranges(e), ...historicalRanges(e)];
  function keyMatches(stored: Event, listing: Event) {
    const key = listingKey(listing);
    return !!key && (listingKey(stored) === key || !!stored.source!.aliases?.includes(key));
  }
  function sameSubject(stored: Event, listing: Event) {
    if (stored.source!.id !== listing.source!.id || !samePlace(stored, listing)) return false;
    if (fold(stored.name) === fold(listing.name)) return true;
    const named = fold(listing.name).match(/^(.+) (20\d\d)$/);
    return !!named && fold(stored.name) === named[1] &&
      !!stored.city && !!listing.city && !!stored.country_code && !!listing.country_code &&
      (keyMatches(stored, listing) || editionRanges(stored).some((r) =>
        r.start_date.startsWith(named[2]) || r.end_date.startsWith(named[2])));
  }
  function compatibleKeys(a: Event, b: Event) {
    return !listingKey(a) || !listingKey(b) || keyMatches(a, b);
  }
  function announced(stored: Event, listing: Event) {
    return !!listing.start_date && (stored.estimated_month === listing.start_date.slice(0, 7) ||
      ranges(stored).some((r) => r.start_date === listing.start_date));
  }
  function canRelist(stored: Event, listing: Event) {
    if (!sameSubject(stored, listing)) return false;
    if (keyMatches(stored, listing) || announced(stored, listing)) return true;
    if (!compatibleKeys(stored, listing)) return false;
    if (!listing.start_date) return listing.date_status === "tba";
    return editionRanges(stored).some((r) => Math.abs(stamp(r.start_date) - stamp(listing.start_date!)) <= 31 * day);
  }
  function candidates(listing: Event) {
    const rows = snapshot.filter((stored) => {
      if (stored.source!.id !== listing.source!.id) return matches(stored, listing);
      if (stored.event_status) return canRelist(stored, listing);
      if (!compatibleKeys(stored, listing)) return false;
      return (sameSubject(stored, listing) && keyMatches(stored, listing)) || matches(stored, listing) ||
        (sameSubject(stored, listing) && (!stored.start_date || !listing.start_date) &&
          (!stored.estimated_month || !listing.estimated_month || stored.estimated_month === listing.estimated_month) &&
          (stored.date_status === "tba" || listing.date_status === "tba" || stored.id === listing.id));
    });
    // A city page may list multiple fully dated stops at the same URL.
    const activeRows = rows.filter((stored) => !stored.scanner_archived);
    const comparable = activeRows.length ? activeRows : rows;
    const exact = comparable.filter((stored) => sameSubject(stored, listing) && ranges(stored).some((r) =>
      r.start_date === listing.start_date && r.end_date === listing.end_date));
    return exact.length ? exact : comparable;
  }
  const claims = new Map(incoming.map((event) => [event, candidates(event)]));
  const known: Record<string, number> = {};
  const byEdition = new Map<number, Notice[]>();
  const applied: Notice[] = [], unmatched: Notice[] = [];
  const blocked = new Set<Event>();
  for (const notice of notices) {
    const matched = snapshot.filter((stored) => {
      if (notice.unknownOriginal || !sameSubject(stored, notice) || !compatibleKeys(stored, notice)) return false;
      const dates = editionRanges(stored);
      if (notice.originalStart)
        return dates.some((r) => r.start_date === notice.originalStart && r.end_date === notice.originalEnd);
      return keyMatches(stored, notice) || (!!stored.city && !!notice.city && !!stored.country_code &&
        !!notice.country_code && (dates.length > 0 || !!stored.estimated_month));
    });
    const activeEditions = matched.filter((event) => !event.scanner_archived);
    const editions = activeEditions.length ? activeEditions : matched;
    if (editions.length !== 1 || incoming.some((card) => card.source!.id === notice.source!.id &&
        (editions.some((stored) => claims.get(card)!.includes(stored)) ||
          (!notice.originalStart && sameSubject(card, notice) && compatibleKeys(card, notice))))) {
      editions.forEach((e) => blocked.add(e));
      unmatched.push(notice);
      continue;
    }
    const index = snapshot.indexOf(editions[0]);
    byEdition.set(index, [...(byEdition.get(index) ?? []), notice]);
  }
  const updates = new Map<number, Notice>();
  for (const [index, group] of byEdition) {
    if (group.length !== 1 || blocked.has(snapshot[index])) {
      unmatched.push(...group);
      continue;
    }
    const notice = group[0];
    updates.set(index, notice);
    applied.push(notice);
    const owner = notice.source!.id;
    known[owner] = (known[owner] ?? 0) + 1;
  }
  const newIds = new Set<string>();
  const ambiguous: Event[] = [];
  const orderedIncoming = [...incoming].sort((a, b) => rank(a.source!.id) - rank(b.source!.id) ||
    a.source!.id.localeCompare(b.source!.id) || (a.start_date ?? "").localeCompare(b.start_date ?? "") ||
    a.id.localeCompare(b.id));
  for (const event of orderedIncoming) {
    const owner = event.source!.id;
    const scannerMatch = scanner.some((s) => s.id === event.id || matches(s, event));
    const rows = claims.get(event)!;
    if (rows.length > 1 || rows.some((row) => incoming.some((other) => other !== event &&
        other.source!.id === owner && claims.get(other)!.includes(row)))) {
      ambiguous.push(event);
      continue;
    }
    if (rows.some((row) => blocked.has(row))) continue;
    let i = rows.length ? snapshot.indexOf(rows[0]) : -1;
    // An organizer and a venue may publish a previously unseen show together.
    if (i < 0) i = retained.findIndex((row, j) => j >= snapshot.length && row.source!.id !== owner && matches(row, event));
    // A secondary calendar can continue advertising the pre-postponement
    // schedule even after the owner has published its replacement.
    if (i < 0 && snapshot.some((e) => e.source!.id !== owner && historicalRanges(e).length &&
        matches({ ...e, occurrences: historicalRanges(e), estimated_month: null }, event))) {
      known[owner] = (known[owner] ?? 0) + 1;
      continue;
    }
    if (scannerMatch || i >= 0) known[owner] = (known[owner] ?? 0) + 1;
    if (scannerMatch || byEdition.has(i)) continue;
    if (i >= 0) {
      const earlier = retained[i];
      const oldOwner = earlier.source!.id;
      if (oldOwner === owner || rank(owner) < rank(oldOwner)) {
        // Only a dated re-listing by the owner can withdraw a published notice.
        if (earlier.event_status && (oldOwner !== owner || !event.start_date)) continue;
        const { outreach: _outreach, ...update } = event;
        retained[i] = {
          ...earlier,
          ...update,
          ...(keyMatches(earlier, event) && { vendor_application: event.vendor_application ?? earlier.vendor_application }),
          ...preserveMilestones(earlier, event),
          ...refreshVendorPricing(earlier, event),
          ...(earlier.trip_budget && { trip_budget: earlier.trip_budget }),
          id: earlier.id,
          logo: event.logo ?? earlier.logo,
          logo_kind: event.logo ? event.logo_kind : earlier.logo_kind,
          description: event.description ?? earlier.description,
          verification: earlier.verification === "verified" ? "verified" : event.verification,
          source: {
            ...earlier.source!,
            ...event.source!,
            ...sourceHistory(earlier, event),
            discovered_at: earlier.source!.discovered_at,
          },
        };
        delete retained[i].event_status;
        delete retained[i].scanner_archived;
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
      const location = event.venue ? " at " + event.venue :
        event.city && !fold(event.name).includes(fold(event.city)) ? " in " + event.city : "";
      retained.push({
        ...event, id,
        description: event.description ?? `${event.source!.name} lists ${event.name}${location}.`,
      });
      newIds.add(id);
    }
  }
  for (const [i, notice] of updates) {
    const earlier = retained[i];
    const updated: Event = { ...earlier, event_status: notice.event_status, date_note: notice.date_note };
    if (notice.event_status === "postponed") {
      updated.start_date = notice.start_date;
      updated.end_date = notice.end_date;
      updated.estimated_month = notice.estimated_month;
      updated.date_status = notice.date_status;
      updated.section = notice.section;
      delete updated.occurrences;
    } else if (!earlier.start_date) {
      const history = historicalRanges(earlier);
      const range = notice.originalStart ? history.find((r) => r.start_date === notice.originalStart &&
        r.end_date === notice.originalEnd) : history.at(-1);
      if (range) Object.assign(updated, range, { date_status: "confirmed", estimated_month: null, section: "timeline" });
    }
    updated.source = {
      ...earlier.source!,
      ...sourceHistory(earlier, updated, notice),
      confidence: notice.event_status === "postponed" ? notice.source!.confidence : earlier.source!.confidence,
    };
    retained[i] = updated;
  }
  // Reconcile rescheduled shows before removing past events from the calendar.
  const active = retained.filter((e) =>
    hasSharedPlanning(e) || (!e.scanner_archived && (!e.end_date || stamp(today) - stamp(e.end_date) <= 30 * day)),
  );
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
  // The scanner cannot read browser storage. Keep the last listing for any plans
  // attached to a removed ID, without putting that listing back in the calendar.
  const activeIds = new Set(ordered.map((event) => event.id));
  const activeSourceIds = new Set(active.map((event) => event.id));
  const archived = new Map<string, Event>();
  for (const event of [...existing, ...retained]) {
    if (!activeIds.has(event.id)) archived.set(event.id, { ...event, scanner_archived: true });
  }
  return {
    events: [...ordered, ...archived.values()],
    added: ordered.filter((e) => newIds.has(e.id)),
    known,
    applied,
    unmatched,
    ambiguous,
    removed: existing.filter((e) => e.source && !e.scanner_archived && !activeSourceIds.has(e.id)).length,
  };
}
