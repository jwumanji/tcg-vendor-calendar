import { emptyEntry, type Entries } from "./storage";
import { TIER_THRESHOLDS } from "./scoring";
import meta from "../data/meta.json";
import type { Event, Filters } from "./model";
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
export type Rarity = "common" | "uncommon" | "rare" | "ultra" | "secret";
/** Card-rarity style tier for a 0-100 vendor score. */
export function rarity(score: number): { tier: Rarity; label: string } {
  if (score >= 80) return { tier: "secret", label: "Secret rare" };
  if (score >= 65) return { tier: "ultra", label: "Ultra rare" };
  if (score >= 50) return { tier: "rare", label: "Rare" };
  if (score >= 30) return { tier: "uncommon", label: "Uncommon" };
  return { tier: "common", label: "Common" };
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
const normalizeSearch = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
export function matches(
  e: Event,
  f: Filters,
  p: Entries,
  priorityScore = 0,
  today = localDate(),
) {
  if (f.going && !p[e.id]?.going) return false;
  if (f.notGoing && p[e.id]?.going) return false;
  if (f.newOnly && !e.is_new_find) return false;
  if (f.minTier !== "any" && priorityScore < TIER_THRESHOLDS[f.minTier])
    return false;
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
    return false;
  if (f.countries.length && !f.countries.includes(e.country || "Unknown"))
    return false;
  if (f.games.length && !games(e).some((g) => f.games.includes(g)))
    return false;
  if (
    f.priority !== "any" &&
    (f.priority === "top"
      ? e.priority_market_level !== "top"
      : !e.priority_market)
  )
    return false;
  if (
    (f.size && e.size_tier !== f.size) ||
    (f.status && e.date_status !== f.status) ||
    (f.stages.length > 0 && !f.stages.includes((p[e.id] || emptyEntry).stage))
  )
    return false;
  if (f.score > 0 && (e.vendor_score === null || e.vendor_score < f.score))
    return false;
  if (e.date_status === "tba") return f.tba && !f.next90;
  if (!f.from && !f.to && !f.next90) return true;
  let from = f.from,
    to = f.to;
  if (f.next90) {
    if (isUndated(e)) return false;
    const end = new Date(today + "T00:00:00Z");
    end.setUTCDate(end.getUTCDate() + 89);
    const last = end.toISOString().slice(0, 10);
    if (from < today) from = today;
    if (!to || to > last) to = last;
    if (from > to) return false;
  }
  const rr =
    e.date_status === "estimated" && e.estimated_month
      ? [
          {
            start_date: e.estimated_month + "-01",
            end_date: monthEnd(e.estimated_month),
          },
        ]
      : ranges(e);
  return rr.some(
    (r) => (!from || r.end_date >= from) && (!to || r.start_date <= to),
  );
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
export function dateLabel(e: Event) {
  if (e.date_status === "estimated")
    return e.estimated_month ? monthLabel(e.estimated_month) : "Estimated";
  if (!e.start_date) return "Dates to be announced";
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
export function ics(events: Event[], includeEstimated = false) {
  if (
    !events.some(
      (e) => hasConfirmedDates(e) || (includeEstimated && hasEstimatedMonth(e)),
    )
  )
    throw new Error("No confirmed dates to export.");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Holo Vault//TCG Vendor Calendar//EN",
    "CALSCALE:GREGORIAN",
  ];
  for (const e of events) {
    const estimated = includeEstimated && hasEstimatedMonth(e);
    if (!estimated && !hasConfirmedDates(e)) continue;
    const first = e.estimated_month + "-01";
    const dates = estimated
      ? [{ start_date: first, end_date: first }]
      : ranges(e);
    for (const r of dates) {
      const next = new Date(r.end_date + "T00:00:00Z");
      next.setUTCDate(next.getUTCDate() + 1);
      lines.push(
        "BEGIN:VEVENT",
        `UID:${e.id}-${r.start_date}@tcg-vendor-calendar`,
        `DTSTAMP:${new Date()
          .toISOString()
          .replace(/[-:]/g, "")
          .replace(/\.\d{3}/, "")}`,
        `DTSTART;VALUE=DATE:${r.start_date.replaceAll("-", "")}`,
        `DTEND;VALUE=DATE:${next.toISOString().slice(0, 10).replaceAll("-", "")}`,
        `SUMMARY:${escapeICS(estimated ? "Est. " + monthLabel(e.estimated_month!) + " · " + e.name : e.name)}`,
        ...(estimated ? ["STATUS:TENTATIVE", "TRANSP:TRANSPARENT"] : []),
        `LAST-MODIFIED:${meta.updatedAt.replaceAll("-", "")}T000000Z`,
        ...([e.venue, e.city, e.country].some(Boolean)
          ? [
              `LOCATION:${escapeICS([e.venue, e.city, e.country].filter(Boolean).join(", "))}`,
            ]
          : []),
        ...([e.description, e.vendor_deadline].some(Boolean)
          ? [
              `DESCRIPTION:${escapeICS([e.description, e.vendor_deadline ? `Vendor deadline: ${e.vendor_deadline}` : null].filter(Boolean).join("\n"))}`,
            ]
          : []),
        ...(safeUrl(e.website) ? [`URL:${escapeICS(e.website!)}`] : []),
        "END:VEVENT",
      );
    }
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
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
        "Status",
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
          : ranges(e)
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
export function dateSortKey(e: Event, today: string) {
  if (e.date_status === "estimated" && e.estimated_month)
    return e.estimated_month + "-32";
  const dates = ranges(e)
    .slice()
    .sort((a, b) => compareText(a.start_date, b.start_date));
  return (
    dates.find((r) => r.end_date >= today)?.start_date ||
    dates[0]?.start_date ||
    "9999"
  );
}
export function timelineGroups(
  events: Event[],
  filters: Filters,
  entries: Entries,
  byStage: boolean,
) {
  const groups = new Map<string, { e: Event; label?: string }[]>();
  for (const e of events) {
    const rr = ranges(e).filter(
      (r) =>
        (!filters.from || r.end_date >= filters.from) &&
        (!filters.to || r.start_date <= filters.to),
    );
    const keys = byStage
      ? [(entries[e.id] || emptyEntry).stage]
      : isUndated(e)
        ? ["9999"]
        : e.date_status === "estimated"
          ? [e.estimated_month!]
          : [...new Set(rr.map((r) => r.start_date.slice(0, 7)))];
    for (const key of keys) {
      groups.set(key, [
        ...(groups.get(key) || []),
        {
          e,
          label:
            !byStage && e.occurrences
              ? rr
                  .filter((r) => r.start_date.startsWith(key))
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
