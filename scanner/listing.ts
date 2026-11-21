import type { Event } from "../src/model.ts";
import { parseDates, parseMonth } from "./dates.ts";
import { fold } from "./relevance.ts";

// These parsers expose an edition-specific listing, booking form or detail URL.
// A calendar page, annual organizer homepage or social profile is shared.
export function listingKey(e: Event): string | null {
  const source = e.source;
  if (!source) return null;
  let key: string | null = null;
  switch (source.id) {
    case "sg-card-show":
      // The organizer reuses its homepage and can run several shows a year.
      if (e.vendor_application && URL.canParse(e.vendor_application))
        key = fold(e.name) + "|" + e.vendor_application;
      break;
    case "suntec":
      if (new URL(source.url).pathname.startsWith("/visit-events/")) key = source.url;
      break;
    case "sg-expo":
    case "bandai":
    case "magic":
      if (e.website && e.website !== source.url && new URL(e.website).pathname !== "/")
        key = e.website;
      break;
    case "afa":
      if (/\/afasg\d+\//i.test(source.url)) key = source.url;
      break;
    // City stops reuse their pages each season. Only a named edition is stable.
    case "sgcc":
    case "oz-comic-con":
    case "supanova":
    case "hkcec":
    case "jump-festa":
      if (/\b20\d\d\b/.test(e.name)) key = fold(e.name);
      break;
  }
  return key && JSON.stringify([source.id, key]);
}

export type Notice = Event & {
  event_status: NonNullable<Event["event_status"]>;
  originalStart: string | null;
  originalEnd: string | null;
  unknownOriginal: boolean;
};

// Match status in a title tag, a statement about the event, or its date field.
// Prose about individual activities is deliberately outside these inputs.
const leading = /^\[?(cancelled|canceled|postponed)\]?\s*[:–—-]?\s+(.+)$/i;
const trailing = /^(.+?)(?:\s*[-–—:(\[]\s*(?:event\s+)?(?:has been\s+)?|\s+has been\s+|\s+(?=postponed\s+(?:to|until)\b))(cancelled|canceled|postponed)\b(?:\s+(?:to|until)\s+(.+?))?[)\]]?[.!]?$/i;
export class ScheduleConflict extends Error {}

const dateTag = /^(?:TBC\s*[-–—:]\s*)?(?:event\s+)?(?:has been\s+)?(now\s+)?(cancelled|canceled|postponed)\b(.*)$/i;

function asKind(word?: string): Notice["event_status"] | null {
  if (!word) return null;
  return /^postponed$/i.test(word) ? "postponed" : "cancelled";
}

function titleParts(name: string) {
  const final = name.trim().match(/^(.+?)(?:\s*[;,:(\[–—-]\s*|\s+)now\s+(cancell?ed|postponed)\b(?:\s+(?:to|until)\s+(.+?))?[)\]]?[.!]?$/i);
  const title = final?.[1] ?? name.trim();
  const prefix = title.match(leading);
  const suffix = title.match(trailing);
  return {
    name: (suffix?.[1] ?? prefix?.[2] ?? title).trim(),
    kind: asKind(final?.[2] ?? suffix?.[2] ?? prefix?.[1]),
    target: final?.[3] ?? suffix?.[3],
    final: !!final,
    conflict: !final && prefix && suffix && asKind(prefix[1]) !== asKind(suffix[2]),
  };
}
export function titleSubject(name: string) {
  return titleParts(name).name;
}

// Keep an annotation with the date it qualifies. An activity annotation can
// be ignored without losing the parsed event range.
export function scheduleField(date: string | null) {
  const appended = date?.trim().match(/^(.+?)\s*[(\[–—-]?\s*\b((?:event\s+)?(?:has been\s+)?(?:now\s+)?(?:cancell?ed|postponed)\b.*?)[)\]]?$/is);
  if (appended && parseDates(appended[1])) return { date: appended[1].trim(), annotation: appended[2] };
  return { date, annotation: date ?? "" };
}

export function scheduleNotice(name: string, date: string | null) {
  const title = titleParts(name);
  const schedule = scheduleField(date);
  const original = parseDates(schedule.date);
  const field = schedule.annotation.match(dateTag);
  const transition = field?.[3].match(/^(?:\s+indefinitely|\s+(?:to|until)\s+[^;,]+)?[;,]?\s+now\s+(cancell?ed|postponed)\b(.*)$/i);
  const explicitFinal = !!(transition || field?.[1]);
  const remainder = (transition?.[2] ?? field?.[3] ?? "").trim().replace(/[.!]$/, "");
  const fieldTarget = remainder.match(/^(?:to\s+|until\s+|[:–—-]\s*)(.+)$/i)?.[1];
  const fieldKind = asKind(transition?.[1] ?? field?.[2]);
  const targetDates = parseDates(fieldTarget ?? null);
  const targetMonth = parseMonth(fieldTarget ?? "");
  const eventAnnotation = !!field && (!remainder || (fieldKind === "postponed" &&
    (targetDates || targetMonth || /^(indefinitely|until further notice)$/i.test(remainder))));
  const conflictingKinds = eventAnnotation && title.kind && title.kind !== fieldKind;
  const cancelledAfterMove = title.kind === "cancelled" && fieldKind === "postponed" && !!(targetDates || targetMonth);
  if (title.conflict || (field && /\b(?:cancell?ed|postponed)\b/i.test(remainder)) ||
      (conflictingKinds && (title.final === explicitFinal) && (explicitFinal || !cancelledAfterMove)))
    throw new ScheduleConflict(`Conflicting schedule notices for ${name}: ${date}`);
  const useField = eventAnnotation && (explicitFinal || (!title.final && !cancelledAfterMove));
  const kind = useField ? fieldKind : title.kind;
  if (!kind) return null;
  const target = kind === "postponed" ? (useField ? fieldTarget ?? title.target : title.target) ?? "" : "";
  return {
    name: title.name,
    kind,
    note: (useField ? date! : name).trim(),
    dates: parseDates(target),
    estimated_month: parseMonth(target),
    originalStart: original?.start ?? null,
    originalEnd: original?.end ?? null,
    // An unparsed date alongside a title notice cannot corroborate an edition.
    unknownOriginal: !original && !eventAnnotation && !!date?.trim() && !/^(?:TBA|TBC)$/i.test(date.trim()),
  };
}
