import { validDate } from "../src/data.ts";

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
const month = (s: string) => months.indexOf(s.toLowerCase().slice(0, 3)) + 1;
const iso = (y: string, m: number, d: string) =>
  [y, String(m).padStart(2, "0"), d.padStart(2, "0")].join("-");
function range(start: string, end = start) {
  return validDate(start) && validDate(end) && end >= start
    ? { start, end }
    : null;
}
export function parseMonth(raw: string) {
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) return raw;
  const m = raw.match(/^([a-z]+) (20\d\d)$/i);
  const n = m && month(m[1]);
  return m && n ? m[2] + "-" + String(n).padStart(2, "0") : null;
}
function startYear(endYear: string, startMonth: string, endMonth: string) {
  return month(startMonth) > month(endMonth) ? String(Number(endYear) - 1) : endYear;
}
export function parseDates(raw: string | null) {
  if (!raw) return null;
  const t = raw
    .trim()
    .replace(/(\d)(?:st|nd|rd|th)\b/gi, "$1")
    .replace(/[–—−]/g, "-")
    .replace(/\s+(?:to|&)\s+/gi, " - ")
    .replace(/,/g, "")
    .replace(/\s+/g, " ");
  let m = t.match(/^(\d{4}-\d\d-\d\d)(?:\s*(?:-|\/)\s*(\d{4}-\d\d-\d\d))?$/);
  if (m) return range(m[1], m[2]);
  m = t.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s*-\s*(\d{1,2})\/(\d{1,2})\/(\d{4}))?$/,
  );
  if (m)
    return range(
      iso(m[3], +m[2], m[1]),
      m[4] ? iso(m[6], +m[5], m[4]) : undefined,
    );
  m = t.match(
    /^(\d{1,2})(?: ([a-z]+)(?: (\d{4}))?)?\s*-\s*(\d{1,2}) ([a-z]+) (\d{4})$/i,
  );
  if (m)
    return range(
      iso(m[3] ?? startYear(m[6], m[2] ?? m[5], m[5]), month(m[2] ?? m[5]), m[1]),
      iso(m[6], month(m[5]), m[4]),
    );
  m = t.match(
    /^([a-z]+) (\d{1,2})(?: (\d{4}))?\s*-\s*(?:([a-z]+) )?(\d{1,2}) (\d{4})$/i,
  );
  if (m)
    return range(
      iso(m[3] ?? startYear(m[6], m[1], m[4] ?? m[1]), month(m[1]), m[2]),
      iso(m[6], month(m[4] ?? m[1]), m[5]),
    );
  m = t.match(/^(\d{1,2}) ([a-z]+) (\d{4})$/i);
  if (m) return range(iso(m[3], month(m[2]), m[1]));
  m = t.match(/^([a-z]+) (\d{1,2}) (\d{4})$/i);
  return m ? range(iso(m[3], month(m[1]), m[2])) : null;
}
export function localDay(now: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function horizon(today: string) {
  const d = new Date(today + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + 18);
  return d.toISOString().slice(0, 10);
}
