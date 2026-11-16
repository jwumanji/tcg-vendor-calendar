import { emptyEntry, type Entries } from "./storage";
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
export function matches(e: Event, f: Filters, p: Entries) {
  if (
    f.search &&
    ![e.name, e.city, e.venue, e.organizer, e.description, ...e.games]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(f.search.toLowerCase())
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
  if (e.date_status === "tba") return f.tba;
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
    (r) => (!f.from || r.end_date >= f.from) && (!f.to || r.start_date <= f.to),
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
export function flag(code: string | null) {
  return code && /^[A-Z]{2}$/.test(code)
    ? String.fromCodePoint(...[...code].map((c) => 127397 + c.charCodeAt(0)))
    : "◎";
}
export function deadlineDate(s: string | null) {
  if (!s) return null;
  const match =
    s.match(
      /\b(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(20\d{2})\b/i,
    ) || s.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (!match) return null;
  const t = Date.parse(match[0] + " UTC");
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}
export const safeUrl = (s: string | null) => !!s && /^https?:\/\//i.test(s);
const escapeICS = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
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
export function ics(events: Event[]) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Vendor Calendar//EN",
    "CALSCALE:GREGORIAN",
  ];
  for (const e of events.filter((e) => e.date_status === "confirmed"))
    for (const r of ranges(e)) {
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
        `SUMMARY:${escapeICS(e.name)}`,
        `LOCATION:${escapeICS([e.venue, e.city, e.country].filter(Boolean).join(", "))}`,
        `DESCRIPTION:${escapeICS(e.description || "")}`,
        "END:VEVENT",
      );
    }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
export function download(content: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
          .map((v) => '"' + String(v ?? "").replaceAll('"', '""') + '"')
          .join(","),
      )
      .join("\r\n")
  );
}
