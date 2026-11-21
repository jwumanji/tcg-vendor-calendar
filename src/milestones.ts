import type { Event, MilestoneType, VendorMilestone } from "./model.ts";

export const milestoneTypeLabels: Record<MilestoneType, string> = {
  booking_opens: "Booking opens",
  application_closes: "Apply by",
  payment_due: "Payment due",
  other: "Other milestone",
};

const saigon = "Asia/Ho_Chi_Minh"; // IANA also recognizes Asia/Saigon.
const cityNames: Record<string, string> = {
  "Asia/Ho_Chi_Minh": "Saigon",
  "Asia/Saigon": "Saigon",
  "Asia/Singapore": "Singapore",
  "Asia/Bangkok": "Bangkok",
  "Asia/Hong_Kong": "Hong Kong",
};
const dateOptions = { day: "numeric", month: "short", year: "numeric" } as const;
const dateOnly = new Intl.DateTimeFormat("en-GB", { ...dateOptions, timeZone: "UTC" });
const dayMs = 86_400_000;
const wallClocks = new Map<string, Intl.DateTimeFormat>();
function wallClock(at: number, timeZone: string) {
  let formatter = wallClocks.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone, era: "short", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    });
    wallClocks.set(timeZone, formatter);
  }
  const parts = Object.fromEntries(formatter.formatToParts(at).map(({ type, value }) => [type, value]));
  const year = parts.era === "AD" ? Number(parts.year) : 1 - Number(parts.year);
  return { year, day: `${String(year).padStart(4, "0")}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

export function milestoneInstantInRange(instant: number, organizerZone: string) {
  const inRange = (year: number) => year >= 1 && year <= 9999;
  return inRange(new Date(instant).getUTCFullYear()) &&
    inRange(wallClock(instant, organizerZone).year) && inRange(wallClock(instant, saigon).year);
}

export const isTimedMilestone = (milestone: VendorMilestone) => milestone.at.includes("T");

export function milestoneTimes(milestone: VendorMilestone) {
  const city = Object.hasOwn(cityNames, milestone.timeZone) ? cityNames[milestone.timeZone] : milestone.timeZone;
  const dayLabel = (day: string) => dateOnly.format(new Date(day + "T00:00:00Z"));
  if (!isTimedMilestone(milestone)) return [`${dayLabel(milestone.at)} · ${city} date`];
  const instant = Date.parse(milestone.at);
  const local = wallClock(instant, milestone.timeZone);
  const user = wallClock(instant, saigon);
  const localLabel = `${dayLabel(local.day)}, ${local.time}`;
  return local.day === user.day && local.time === user.time
    ? [`${localLabel} ${city === "Saigon" ? city : city + " / Saigon"}`]
    : [`${dayLabel(user.day)}, ${user.time} Saigon`, `${localLabel} ${city}`];
}

export function milestonePassed(milestone: VendorMilestone, now: number) {
  return isTimedMilestone(milestone)
    ? Date.parse(milestone.at) < now
    : milestone.at < wallClock(now, milestone.timeZone).day;
}

function milestoneDay(milestone: VendorMilestone) {
  return isTimedMilestone(milestone) ? wallClock(Date.parse(milestone.at), saigon).day : milestone.at;
}

export function milestoneCalendarUnavailable(event: Event, milestone: VendorMilestone) {
  if (event.event_status) return `Calendar export is paused while the event is ${event.event_status}.`;
  if (!milestone.verified) return "Verify this date to add it to your calendar.";
}

export function milestoneCountdown(event: Event, milestone: VendorMilestone, now: number) {
  if (milestoneCalendarUnavailable(event, milestone) || milestonePassed(milestone, now)) return;
  const timed = isTimedMilestone(milestone);
  const today = wallClock(now, timed ? saigon : milestone.timeZone).day;
  const days = (Date.parse(milestoneDay(milestone)) - Date.parse(today)) / dayMs;
  if (days === 0) return timed ? "today" : "by end of day";
  return `in ${days} ${days === 1 ? "day" : "days"}`;
}

export function compareMilestones(a: VendorMilestone, b: VendorMilestone) {
  const aTimed = isTimedMilestone(a);
  const bTimed = isTimedMilestone(b);
  const order = aTimed && bTimed
    ? Date.parse(a.at) - Date.parse(b.at)
    : milestoneDay(a).localeCompare(milestoneDay(b)) || Number(bTimed) - Number(aTimed);
  return order || a.id.localeCompare(b.id);
}

export function upcomingMilestones(events: Event[], now: number) {
  return events.flatMap((event) => event.event_status ? [] :
    (event.vendor_milestones ?? [])
      .filter((milestone) => milestone.verified && !milestonePassed(milestone, now))
      .map((milestone) => ({ event, milestone })),
  ).sort((a, b) => compareMilestones(a.milestone, b.milestone) || a.event.id.localeCompare(b.event.id));
}
