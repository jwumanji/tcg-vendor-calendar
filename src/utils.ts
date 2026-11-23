import { emptyEntry, type Entries } from "./storage";
import { TIER_THRESHOLDS } from "./scoring";
import meta from "../data/meta.json";
import type { Event, EventDateRange, Filters, VendorMilestone } from "./model";
import { milestoneSourceHref } from "./data";
import { isTimedMilestone, milestoneCalendarUnavailable, milestoneTimes } from "./milestones";
export const gameRules: [string, RegExp][] = [
  ["Pokémon", /pok[eé]mon/i],
  ["One Piece", /one piece/i],
  ["MTG", /magic|\bmtg\b/i],
  ["Yu-Gi-Oh!", /yu.?gi.?oh/i],
  ["Dragon Ball", /dragon ball/i],
  ["Union Arena", /union arena/i],
  ["Lorcana", /lorcana/i],
  ["Digimon", /digimon/i],
  ["Weiss Schwarz", /wei[ßs]+ schwarz/i],
  ["Vanguard", /vanguard/i],
  ["Flesh and Blood", /flesh and blood/i],
  ["Gundam", /gundam/i],
];
/** Slug used for the per-game colour accent (`data-game` attribute). */
export function gameKey(name: string) {
  return (
    name
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z]+/g, "") || "other"
  );
}
/** Accent key for a raw game string from the data (e.g. "Pokémon-led"). */
export function gameKeyOf(raw: string) {
  const hit = gameRules.find(([, r]) => r.test(raw));
  return hit ? gameKey(hit[0]) : "other";
}
/** Accent key for an event's primary (first recognised) game. */
export function primaryGameKey(e: Event) {
  return gameKey(games(e)[0]);
}
export function games(e: Event) {
  const found = gameRules
    .filter(([, r]) => e.games.some((g) => r.test(g)))
    .map(([n]) => n);
  return found.length ? found : ["Other"];
}
export function ranges(e: Event) {
  return e.occurrences?.length
    ? e.occurrences
    : e.start_date
      ? [{ start_date: e.start_date, end_date: e.end_date || e.start_date }]
      : [];
}
export function occurrenceKey({ start_date, end_date }: EventDateRange) {
  return `${start_date}/${end_date}`;
}
export function overlappingDateRange(a: EventDateRange, b: EventDateRange) {
  const start_date = a.start_date > b.start_date ? a.start_date : b.start_date;
  const end_date = a.end_date < b.end_date ? a.end_date : b.end_date;
  return start_date <= end_date ? { start_date, end_date } : null;
}

export function visibleRanges(e: Event) {
  return e.visible_ranges ?? ranges(e);
}
const normalizeSearch = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
export function matchingEvent(
  e: Event,
  f: Filters,
  p: Entries,
  priorityScore = 0,
  today = localDate(),
) {
  if (f.going && !p[e.id]?.going) return null;
  if (f.notGoing && p[e.id]?.going) return null;
  if (f.newOnly && !e.is_new_find) return null;
  const contacted = (e.outreach?.status ?? "not_contacted") !== "not_contacted";
  if (f.outreach && contacted !== (f.outreach === "contacted")) return null;
  if (f.minTier !== "any" && priorityScore < TIER_THRESHOLDS[f.minTier])
    return null;
  if (
    f.search &&
    !normalizeSearch(
      [
        e.name,
        e.city,
        e.country,
        e.country_code,
        e.country_code === "AE" ? "UAE" : "",
        e.venue,
        e.organizer,
        e.description,
        e.fit,
        e.audience,
        e.games_note,
        ...e.games,
      ]
        .filter(Boolean)
        .join(" "),
    ).includes(normalizeSearch(f.search))
  )
    return null;
  if (f.countries.length && !f.countries.includes(e.country || "Unknown"))
    return null;
  if (f.games.length && !games(e).some((g) => f.games.includes(g)))
    return null;
  if (
    f.priority !== "any" &&
    (f.priority === "top"
      ? e.priority_market_level !== "top"
      : !e.priority_market)
  )
    return null;
  if (
    (f.size && e.size_tier !== f.size) ||
    (f.status && scheduleStatus(e) !== f.status) ||
    (f.stages.length > 0 && !f.stages.includes((p[e.id] || emptyEntry).stage))
  )
    return null;
  if (f.score > 0 && (e.vendor_score === null || e.vendor_score < f.score))
    return null;
  return eventInDateWindow(e, f, today);
}

function eventInDateWindow(e: Event, f: Filters, today: string): Event | null {
  if (e.date_status === "tba") return f.tba && !f.next90 ? e : null;
  if (!f.from && !f.to && !f.next90) return e;
  let from = f.from,
    to = f.to;
  if (f.next90) {
    if (isUndated(e)) return null;
    const end = new Date(today + "T00:00:00Z");
    end.setUTCDate(end.getUTCDate() + 89);
    const last = end.toISOString().slice(0, 10);
    if (from < today) from = today;
    if (!to || to > last) to = last;
  }
  if (from && to && from > to) return null;
  const overlaps = (r: { start_date: string; end_date: string }) =>
    (!from || r.end_date >= from) && (!to || r.start_date <= to);
  if (e.date_status === "estimated" && e.estimated_month) {
    return overlaps({ start_date: e.estimated_month + "-01", end_date: monthEnd(e.estimated_month) }) ? e : null;
  }
  const selected = e.occurrences?.length ? selectOccurrences(e, overlaps) : e;
  if (!selected) return null;
  const published = ranges(selected);
  const visible = published.filter(overlaps).map((r) => ({
    start_date: from && from > r.start_date ? from : r.start_date,
    end_date: to && to < r.end_date ? to : r.end_date,
  }));
  if (!visible.length) return null;
  return visible.some((r, i) => r.start_date !== published[i].start_date || r.end_date !== published[i].end_date)
    ? { ...selected, visible_ranges: visible } : selected;
}

export function matches(...args: Parameters<typeof matchingEvent>) {
  return matchingEvent(...args) !== null;
}

function selectOccurrences(e: Event, keep: (r: { start_date: string; end_date: string }) => boolean) {
  const all = e.occurrences!;
  if (all.every(keep)) return e;
  const kept = all.filter(keep);
  if (!kept.length) return null;
  return {
    ...e, occurrences: kept, start_date: kept[0].start_date, end_date: kept[0].end_date,
  };
}
export function monthEnd(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
}
export function monthLabel(m: string) {
  return new Date(m + "-02T12:00:00").toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}
export function prettyDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
export function formatDateRange(start: string, end?: string | null) {
  const first = prettyDate(start);
  if (!end || start === end) return first;
  const last = prettyDate(end);
  return start.slice(0, 7) === end.slice(0, 7)
    ? `${first.split(" ")[0]}–${last}`
    : `${first} – ${last}`;
}
export function occurrenceOn(e: Event, day: string) {
  const range = e.occurrences?.find((r) => r.start_date <= day && day <= r.end_date);
  if (!range) return undefined;
  return dateLabel({ ...e, ...range });
}
export function scheduleStatus(e: Event) {
  return e.event_status ?? e.date_status;
}
export function dateLabel(e: Event) {
  if (e.date_status === "estimated")
    return e.estimated_month ? monthLabel(e.estimated_month) : "Estimated";
  if (!e.start_date) return "Dates not announced";
  return (
    prettyDate(e.start_date) +
    (e.end_date && e.end_date !== e.start_date
      ? " – " + prettyDate(e.end_date)
      : "")
  );
}
/** Twemoji file name for a country code, e.g. "SG" -> "1f1f8-1f1ec.svg". */
export function flagFile(code: string | null) {
  if (!code || !/^[A-Z]{2}$/.test(code)) return null;
  return (
    [...code].map((c) => (127397 + c.charCodeAt(0)).toString(16)).join("-") +
    ".svg"
  );
}
/** Place text without the country code: "Wan Chai, Hong Kong" / "Singapore" / "Location TBA". */
export function placeLabel(
  e: { city: string | null; country: string | null },
  countryOnly = false,
) {
  if (!e.country) return "Location TBA";
  if (countryOnly) return e.country;
  if (e.city && e.city.toLowerCase() !== e.country.toLowerCase())
    return `${e.city}, ${e.country}`;
  return e.country;
}
export function deadlineDate(s: string | null) {
  if (!s) return null;
  const months = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ];
  const pattern =
    /\b(?:(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(20\d{2})|(20\d{2})-(\d{2})-(\d{2}))\b/gi;
  const found = [...s.matchAll(pattern)];
  const candidates = found.flatMap((match, position) => {
    const y = Number(match[3] || match[4]);
    const m = match[2]
      ? months.indexOf(match[2].slice(0, 3).toLowerCase())
      : Number(match[5]) - 1;
    const d = Number(match[1] || match[6]);
    const date = new Date(Date.UTC(y, m, d));
    if (
      date.getUTCFullYear() !== y ||
      date.getUTCMonth() !== m ||
      date.getUTCDate() !== d
    )
      return [];
    const index = match.index!;
    const previous = found[position - 1];
    const next = found[position + 1];
    const before =
      s
        .slice(previous ? previous.index! + previous[0].length : 0, index)
        .split(/[;,\n.]/)
        .at(-1) || "";
    const after = s
      .slice(index + match[0].length, next?.index)
      .split(/[;,\n.]/)[0];
    const label =
      /\b(vendors?|booths?|exhibitors?|deadline|apply|application|closes?|due|players?)\b/i;
    // Labels normally precede a date. Limit context to adjacent dates so a
    // later vendor label cannot turn an earlier player date into a deadline.
    const context = label.test(before) ? before : after;
    const score =
      (/\b(vendors?|booths?|exhibitors?)\b/i.test(context) ? 10 : 0) +
      (/\b(deadline|apply|application|closes?|due)\b/i.test(context) ? 3 : 0) -
      (/\bplayers?\b/i.test(context) ? 5 : 0);
    return [{ date: date.toISOString().slice(0, 10), score }];
  });
  return candidates.sort((a, b) => b.score - a.score)[0]?.date || null;
}
export const safeUrl = (s: string | null) => !!s && /^https?:\/\//i.test(s);
const escapeICS = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/\r\n?|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
export function foldLine(s: string) {
  let lines = "",
    part = "",
    bytes = 0;
  for (const c of s) {
    const n = new TextEncoder().encode(c).length;
    if (bytes + n > 75) {
      lines += part + "\r\n";
      part = " ";
      bytes = 1;
    }
    part += c;
    bytes += n;
  }
  return lines + part;
}
export function goingEvents(events: Event[], entries: Entries) {
  return events.filter((e) => entries[e.id]?.going);
}
export function hasConfirmedDates(e: Event) {
  return e.date_status === "confirmed" && ranges(e).length > 0;
}
export function hasEstimatedMonth(e: Event) {
  return e.date_status === "estimated" && Boolean(e.estimated_month);
}
const calendarHeader = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Holo Vault//TCG Vendor Calendar//EN",
  "CALSCALE:GREGORIAN",
];
const icsInstant = (at: Date) => at.toISOString().replace(/[-:]|\.\d{3}/g, "");
function serializeCalendar(lines: string[]) {
  return [...calendarHeader, ...lines, "END:VCALENDAR"].map(foldLine).join("\r\n") + "\r\n";
}

export function milestoneIcs(event: Event, milestone: VendorMilestone) {
  const blocked = milestoneCalendarUnavailable(event, milestone);
  if (blocked) throw new Error(blocked);
  const sourceUrl = milestoneSourceHref(milestone.source);
  return serializeCalendar([
    "BEGIN:VEVENT",
    `UID:${encodeURIComponent(event.id)}:${milestone.id}@milestones.tcg-vendor-calendar`,
    `DTSTAMP:${icsInstant(new Date())}`,
    isTimedMilestone(milestone)
      ? `DTSTART:${icsInstant(new Date(milestone.at))}`
      : `DTSTART;VALUE=DATE:${milestone.at.replaceAll("-", "")}`,
    `SUMMARY:${escapeICS(`${event.name} — ${milestone.label}`)}`,
    `DESCRIPTION:${escapeICS([...milestoneTimes(milestone), milestone.notes, sourceUrl ? null : milestone.source].filter(Boolean).join("\n"))}`,
    ...(sourceUrl ? [`URL:${escapeICS(sourceUrl)}`] : []),
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
  ]);
}

export function ics(events: Event[], includeEstimated = false) {
  if (
    !events.some(
      (e) => hasConfirmedDates(e) || (includeEstimated && hasEstimatedMonth(e)),
    )
  )
    throw new Error("No confirmed dates to export.");
  const lines: string[] = [];
  for (const e of events) {
    const estimated = includeEstimated && hasEstimatedMonth(e);
    if (!estimated && !hasConfirmedDates(e)) continue;
    const first = e.estimated_month + "-01";
    const dates = estimated
      ? [{ start_date: first, end_date: first }]
      : ranges(e);
    const verified = e.vendor_milestones?.filter((milestone) => !milestoneCalendarUnavailable(e, milestone));
    const description = [
      e.description,
      ...(verified ?? []).map((milestone) =>
        [milestone.label, ...milestoneTimes(milestone), milestone.notes].filter(Boolean).join(" · "),
      ),
      !e.event_status && e.vendor_deadline ? `${verified?.length ? "Vendor notice" : "Vendor deadline"}: ${e.vendor_deadline}` : null,
    ].filter(Boolean).join("\n");
    for (const [index, r] of dates.entries()) {
      const occurrence = e.occurrences?.[index];
      const publishedStart = occurrence ? occurrence.original_start_date ?? occurrence.start_date :
        e.original_start_date ?? e.source?.original_dates?.[0]?.start_date ?? e.source?.previous_dates?.[0]?.start_date ?? r.start_date;
      const next = new Date(r.end_date + "T00:00:00Z");
      next.setUTCDate(next.getUTCDate() + 1);
      lines.push(
        "BEGIN:VEVENT",
        `UID:${e.id}-${publishedStart}@tcg-vendor-calendar`,
        `DTSTAMP:${icsInstant(new Date())}`,
        `DTSTART;VALUE=DATE:${r.start_date.replaceAll("-", "")}`,
        `DTEND;VALUE=DATE:${next.toISOString().slice(0, 10).replaceAll("-", "")}`,
        `SUMMARY:${escapeICS(estimated ? "Est. " + monthLabel(e.estimated_month!) + " · " + e.name : e.name)}`,
        ...(e.event_status === "cancelled" ? ["STATUS:CANCELLED", "TRANSP:TRANSPARENT"] :
          estimated ? ["STATUS:TENTATIVE", "TRANSP:TRANSPARENT"] : []),
        `LAST-MODIFIED:${meta.updatedAt.replaceAll("-", "")}T000000Z`,
        ...([e.venue, e.city, e.country].some(Boolean)
          ? [
              `LOCATION:${escapeICS([e.venue, e.city, e.country].filter(Boolean).join(", "))}`,
            ]
          : []),
        ...(description ? [`DESCRIPTION:${escapeICS(description)}`] : []),
        ...(safeUrl(e.website) ? [`URL:${escapeICS(e.website!)}`] : []),
        "END:VEVENT",
      );
    }
  }
  return serializeCalendar(lines);
}
export function download(content: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export function csv(events: Event[], entries: Entries = {}) {
  return (
    "\uFEFF" +
    [
      [
        "Name",
        "Country",
        "City",
        "Date status",
        "Event status",
        "Start",
        "End",
        "Estimated month",
        "Score",
        "Vendor deadline",
        "Website",
        "Pipeline stage",
        "Notes",
      ],
      ...events.map((e) => [
        e.name,
        e.country,
        e.city,
        e.date_status,
        e.event_status ?? "scheduled",
        e.start_date,
        e.end_date,
        e.estimated_month,
        e.vendor_score,
        e.vendor_deadline,
        e.website,
        (entries[e.id] || emptyEntry).stage,
        entries[e.id]?.note || "",
      ]),
    ]
      .map((row) =>
        row
          .map(
            (v) =>
              '"' +
              (typeof v === "string" && /^[=+\-@\t\r]/.test(v)
                ? "'" + v
                : String(v ?? "")
              ).replaceAll('"', '""') +
              '"',
          )
          .join(","),
      )
      .join("\r\n")
  );
}

export const compareText = (a: string, b: string) =>
  a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });
export function isUndated(e: Event) {
  return (
    e.date_status === "tba" ||
    (e.date_status === "estimated" ? !e.estimated_month : !ranges(e).length)
  );
}
export function upcoming(e: Event, today: string) {
  return (
    isUndated(e) ||
    (e.estimated_month
      ? monthEnd(e.estimated_month) >= today
      : ranges(e).some((r) => r.end_date >= today))
  );
}
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function nextMonth(events: Event[], today: string) {
  return (
    events
      .flatMap((e) =>
        e.estimated_month && monthEnd(e.estimated_month) >= today
          ? [e.estimated_month]
          : visibleRanges(e)
              .filter((r) => r.end_date >= today)
              .map((r) =>
                r.start_date < today
                  ? today.slice(0, 7)
                  : r.start_date.slice(0, 7),
              ),
      )
      .sort()[0] || today.slice(0, 7)
  );
}
function nextRangeIndex(e: Event, today: string) {
  return visibleRanges(e).map((r, i) => ({ r, i })).sort((a, b) =>
    Number(a.r.end_date < today) - Number(b.r.end_date < today) ||
    compareText(a.r.start_date, b.r.start_date))[0]?.i;
}
export function dateSortRange(e: Event, today: string) {
  return ranges(e)[nextRangeIndex(e, today)];
}

export function displayDateLabel(e: Event, today: string) {
  if (e.date_status === "tba" && e.estimated_month) return "Est. " + monthLabel(e.estimated_month);
  const range = dateSortRange(e, today);
  const { start_date, end_date } = range ?? e;
  return e.date_status !== "estimated" && start_date
    ? formatDateRange(start_date, end_date)
    : dateLabel(e);
}
export function dateSortKey(e: Event, today: string) {
  if (e.date_status !== "confirmed")
    return e.estimated_month ? e.estimated_month + "-32" : "9999";
  return visibleRanges(e)[nextRangeIndex(e, today)]?.start_date ?? "9999";
}
export function timelineGroups(
  events: Event[],
  filters: Filters,
  entries: Entries,
  byStage: boolean,
  today = localDate(),
) {
  const groups = new Map<string, { e: Event; label?: string }[]>();
  for (const event of events) {
    const e = eventInDateWindow(event, filters, today);
    if (!e) continue;
    const rr = ranges(e);
    const visible = visibleRanges(e);
    const months = visible.flatMap((r) => {
      const keys = [];
      for (let month = r.start_date.slice(0, 7); month <= r.end_date.slice(0, 7);) {
        keys.push(month);
        const next = new Date(month + "-01T00:00:00Z");
        next.setUTCMonth(next.getUTCMonth() + 1);
        month = next.toISOString().slice(0, 7);
      }
      return keys;
    });
    const keys = byStage
      ? [(entries[e.id] || emptyEntry).stage]
      : isUndated(e)
        ? ["9999"]
        : e.date_status === "estimated"
          ? [e.estimated_month!]
          : [...new Set(months)];
    for (const key of keys) {
      groups.set(key, [
        ...(groups.get(key) || []),
        {
          e,
          label:
            !byStage && e.occurrences
              ? rr
                  .filter((_, i) => visible[i].start_date.slice(0, 7) <= key && visible[i].end_date.slice(0, 7) >= key)
                  .map(
                    (r) =>
                      prettyDate(r.start_date) +
                      (r.end_date !== r.start_date
                        ? " – " + prettyDate(r.end_date)
                        : ""),
                  )
                  .join(" · ")
              : undefined,
        },
      ]);
    }
  }
  return groups;
}

/** Planning season starts here: earlier events are hidden by default (kept in the data). */
export const SEASON_START = "2027-01-01";
/**
 * Events for the 2027+ season. Anything wholly before SEASON_START is hidden;
 * recurring events keep only their occurrences from SEASON_START on; undated
 * (TBA) events stay. Pass includeEarlier to get everything unchanged. Ids are
 * never touched, so notes, stages and Going marks survive.
 */
export function seasonEvents(events: Event[], includeEarlier = false): Event[] {
  if (includeEarlier) return events;
  const out: Event[] = [];
  for (const e of events) {
    if (e.occurrences?.length) {
      const kept = selectOccurrences(e, (r) => r.end_date >= SEASON_START);
      if (kept) out.push(kept);
      continue;
    }
    const last = e.end_date || e.start_date;
    if (last) {
      if (last >= SEASON_START) out.push(e);
    } else if (e.estimated_month) {
      if (e.estimated_month >= SEASON_START.slice(0, 7)) out.push(e);
    } else out.push(e);
  }
  return out;
}

export type CountryOption = { name: string; code: string | null; count: number };
/** Countries present in `events` (alphabetical, "Unknown" last) with flag code and event count. */
export function countryOptions(events: Event[]): CountryOption[] {
  const map = new Map<string, CountryOption>();
  for (const e of events) {
    const name = e.country || "Unknown";
    const o = map.get(name) || { name, code: null, count: 0 };
    o.count++;
    o.code = o.code || e.country_code;
    map.set(name, o);
  }
  return [...map.values()].sort(
    (a, b) =>
      Number(a.name === "Unknown") - Number(b.name === "Unknown") ||
      compareText(a.name, b.name),
  );
}


export function selectedFlags(selected: string[], options: CountryOption[], max = 3) {
  const flags = selected
    .map((name) => options.find((option) => option.name === name)?.code)
    .filter((code): code is string => Boolean(code && flagFile(code)))
    .slice(0, Math.max(0, max));
  return { flags, more: selected.length - flags.length };
}
