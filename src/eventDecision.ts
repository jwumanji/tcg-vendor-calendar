import { outreachContactHref, validDate } from "./data";
import { compareMilestones, milestoneCountdown, milestonePassed } from "./milestones";
import { emptyOutreach, type Event, type Outreach } from "./model";
import { followUp } from "./outreach";
import type { ScoreResult } from "./scoring";
import type { Entries, Stage } from "./storage";
import { dateLabel, deadlineDate, goingEvents, ranges, safeUrl, upcoming } from "./utils";

const saigonCalendar = new Intl.DateTimeFormat("en", {
  timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit",
});
export function saigonDay(now: number) {
  const parts = Object.fromEntries(saigonCalendar.formatToParts(now).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function waitingDays(outreach: Outreach, today: string) {
  if (outreach.status !== "contacted" || !validDate(outreach.contacted_at)) return;
  const days = (Date.parse(today) - Date.parse(outreach.contacted_at)) / 86_400_000;
  return days >= 0 ? days : undefined;
}

export function goingConflicts(event: Event, eligibleEvents: Event[], entries: Entries, today: string, occurrence?: string) {
  if (event.date_status !== "confirmed" || event.event_status) return [];
  const dates = ranges(event).filter((range) => occurrence
    ? dateLabel({ ...event, ...range }) === occurrence
    : range.end_date >= today);
  return goingEvents(eligibleEvents, entries).flatMap((other) => {
    if (other.id === event.id || other.date_status !== "confirmed" || other.event_status) return [];
    const overlaps = new Set(ranges(other).flatMap((otherRange) =>
      dates.flatMap((range) => {
        const start_date = range.start_date > otherRange.start_date ? range.start_date : otherRange.start_date;
        const end_date = range.end_date < otherRange.end_date ? range.end_date : otherRange.end_date;
        return start_date <= end_date ? [dateLabel({ ...event, start_date, end_date })] : [];
      })));
    return [...overlaps].map((date) => ({ id: other.id, name: other.name, date }));
  });
}

export function decisionReason(event: Event, score: ScoreResult) {
  if (event.event_status === "cancelled") return "The event has been cancelled.";
  if (event.event_status === "postponed") return "The event is postponed. Confirm new dates before making bookings.";
  const factor = score.factors.filter(({ key, basis, weight, signals }) =>
    key !== "logistics" && key !== "clash" && basis === "real" && weight > 0 && signals.length > 0)
    .sort((a, b) => b.points - a.points)[0];
  if (!factor) return "There is limited verified evidence to assess vendor fit.";
  return factor.signals[0];
}

const restrictedWindow = /\b(?:returning|priority|early[ -]bird|artist[ -]alley)\b/i;

export function vendorTiming(event: Event, now: number) {
  const notice = event.vendor_deadline?.trim();
  const timing = (event.vendor_milestones ?? []).filter(({ type, verified, id, label }) =>
    verified && (type === "application_closes" || type === "booking_opens") &&
    !restrictedWindow.test(id.replaceAll("_", " ") + " " + label))
    .sort(compareMilestones);
  const generalClose = timing.filter((m) => m.type === "application_closes").at(-1);
  const verifiedClosed = !!generalClose && milestonePassed(generalClose, now);
  const firstCome = /first[ -]come[ ,‑-]+first[ -]served|\bFCFS\b/i;
  const fcfs = firstCome.test([notice, event.vendor_booths, ...timing.map((m) => m.notes)].join(" "));
  const rolling = /\brolling\b/i.test(notice ?? "");
  const milestone = verifiedClosed ? generalClose : timing.find((m) => !milestonePassed(m, now)) ?? timing.at(-1);
  const passed = milestone && milestonePassed(milestone, now);
  const referencedEdition = notice?.match(/\b(20\d\d) edition\b/i)?.[1];
  const eventYear = (event.start_date ?? event.estimated_month)?.slice(0, 4) ?? event.name.match(/\b20\d\d\b/)?.[0];
  const historical = referencedEdition && eventYear && referencedEdition !== eventYear;
  const currentNotice = notice && !historical && !/\b(?:not (?:published|captured|announced)|unknown|TBA|TBD|player|lottery)\b|\b(?:past|prior|previous) edition\b/i.test(notice)
    && !/^[-–—]+$/.test(notice);
  const generalNotice = notice?.split(/[;\n]|\.\s/)
    .filter((clause) => !restrictedWindow.test(clause) || /\bgeneral\b/i.test(clause)).join("; ");
  const pastNotice = Boolean(currentNotice && generalNotice && /\bclosed\b/i.test(generalNotice));
  const opening = currentNotice && generalNotice && /\bopen(?:s|ed|ing)?\b/i.test(generalNotice);
  const applyBy = currentNotice && generalNotice && !pastNotice && !opening && deadlineDate(generalNotice);
  const deadlinePassed = Boolean(applyBy && applyBy < saigonDay(now));
  if (event.event_status) return { label: "Vendor timing", notice: `Vendor timing on hold · event ${event.event_status}` };
  const label = milestone?.type === "application_closes" ? (passed ? "Applications closed" : "Apply by")
    : fcfs ? "First come, first served" : rolling ? "Rolling applications" : pastNotice ? "Vendor notice"
    : milestone?.type === "booking_opens" ? "Booking opens"
      : applyBy ? (deadlinePassed ? "Application deadline passed" : "Apply by") : opening ? "Booking notice" : "Vendor timing";
  return {
    label, milestone, passed,
    countdown: milestone && milestoneCountdown(event, milestone, now),
    notice: currentNotice && !milestone ? notice : undefined,
    referenceNotice: !event.event_status && notice && (!currentNotice || milestone && milestone.type !== "booking_opens") ? notice : undefined,
    notes: milestone?.notes,
    awaitingOpening: milestone?.type === "booking_opens" && !passed && !event.event_status,
    closed: generalClose ? verifiedClosed : (pastNotice && !/artist[ -]alley|art booths?/i.test(generalNotice ?? "")) ||
      deadlinePassed ||
      /^(?:applications?|vendor (?:booking|registration)) (?:are )?closed\b/i.test(event.vendor_booths ?? ""),
  };
}

function extractRoutes(text?: string | null) {
  if (!text) return [];
  const links = (text.match(/https?:\/\/[^\s;,()]+|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:[\w-]+\.)+(?:com|net|org|asia|vn|sg|hk|au|app|ae|id|my|th|jp|me)(?=\/)[^\s;,()]*/gi) ?? [])
    .map((route) => route.replace(/[.!?]+$/, ""))
    .flatMap((label) => {
      const href = outreachContactHref(label) ?? outreachContactHref("https://" + label);
      return href ? [{ href, label }] : [];
    });
  for (const match of text.matchAll(/\b(WhatsApp|Tel(?:ephone)?|Phone)[: ]+(\+\d[\d .-]*\d)/gi)) {
    const number = match[2].replace(/\D/g, "");
    if (number.length < 7 || number.length > 15) continue;
    links.push({
      label: match[0],
      href: /^whatsapp$/i.test(match[1]) ? "https://wa.me/" + number : "tel:+" + number,
    });
  }
  return links;
}

type VendorPurpose = "application" | "interest" | "contact" | "official" | "reference";
const routeLabels: Record<VendorPurpose, string> = {
  application: "Apply",
  interest: "Register interest",
  contact: "Ask organizer",
  official: "Check official site",
  reference: "View reference source",
};

type VendorRoute = { href: string; label: string; purpose: VendorPurpose };

export function routeAction(route: VendorRoute) {
  return { label: routeLabels[route.purpose], href: route.href, purpose: route.purpose };
}

export function isApplyPurpose(purpose?: VendorPurpose) {
  return purpose === "application" || purpose === "interest";
}

const sameUrl = (left: string, right: string) => left.replace(/\/$/, "") === right.replace(/\/$/, "");
function isWebContact(href: string) {
  if (!safeUrl(href)) return false;
  const { hostname, pathname } = new URL(href);
  return /^(?:wa\.me|(?:www\.)?(?:instagram|facebook)\.com|m\.me)$/i.test(hostname) ||
    /\/(?:contact(?:-us)?|enquir(?:y|ies))(?:\.html)?\/?$/i.test(pathname);
}

function applicationRoute(event: Event): VendorRoute | undefined {
  const access = event.vendor_booths ?? "";
  const restricted = /^(?:no\b|not published|not announced|players?\b)|\b(?:historically|past editions|application.+not opened)\b/i;
  if (restricted.test(access)) return;
  const year = (event.start_date ?? event.estimated_month)?.slice(0, 4) ?? event.name.match(/\b20\d\d\b/)?.[0];
  for (const clause of (event.vendor_application ?? "").split(/[;\n]/)) {
    if (restricted.test(clause.trim()) || /\b(?:prior|past|previous)[ -]edition\b/i.test(clause)) continue;
    for (const route of extractRoutes(clause)) {
      if (!safeUrl(route.href)) continue;
      const { hostname, pathname } = new URL(route.href);
      const years = clause.replace(route.href, pathname).match(/\b20\d\d\b/g);
      if (year && years?.some((candidate) => candidate !== year)) continue;
      if (/\b(?:faq|why-exhibit)\b/i.test(pathname)) continue;
      const form = hostname === "forms.gle" || hostname === "docs.google.com" && pathname.startsWith("/forms/");
      const interest = /expressions?-of-interest|register(?:-your)?-interest|interest-registration/i.test(pathname);
      if (interest || form && /\b(?:register interest|expression of interest)\b/i.test(clause))
        return { ...route, purpose: "interest" };
      if (form || /^(?:exhibitors|booking)\./i.test(hostname) ||
        /\/(?:apply|applications?|vendor[-_]?applications?|vendorportal|tablereservations|vendors|book-space|pricing)(?:[/.?#-]|$)/i.test(pathname) ||
        /\/exhibitor-application(?:[/.?#-]|$)/i.test(pathname) ||
        /\b(?:table booking system|exhibitor application)\b/i.test(clause))
        return { ...route, purpose: "application" };
    }
  }
}

export function vendorRoutes(event: Event, shared?: Outreach | null) {
  const outreach = event.outreach ?? emptyOutreach;
  const official: VendorRoute | undefined = safeUrl(event.website)
    ? { href: event.website!, label: event.website!, purpose: "official" } : undefined;
  const application = applicationRoute(event);
  const sourceLinks = event.source_urls.filter((href) => safeUrl(href));
  const candidates = [
    ...extractRoutes(outreach.contact),
    ...extractRoutes(shared?.contact),
    ...extractRoutes(event.contact),
    ...extractRoutes(event.vendor_application),
    ...extractRoutes(event.instagram),
  ];
  const directContacts = [...new Map(candidates.filter(({ href }) =>
    ![official, application].some((route) => route && sameUrl(href, route.href)) &&
    !/^mailto:(?:no[-_.]?reply|do[-_.]?not[-_.]?reply)@/i.test(href) &&
    (/^(?:mailto|tel):/i.test(href) || href === event.instagram || isWebContact(href) ||
      !sourceLinks.some((source) => sameUrl(href, source)) && [outreach, shared].some((record) =>
        href === record?.contact && (record.contact_type === "form" || record.method === "form"))))
    .map((route) => [route.href, { ...route, purpose: "contact" as const }])).values()];
  const [contact, ...alternatives] = directContacts;
  const referenceHref = sourceLinks.find((href) =>
    ![official, application, ...directContacts].some((route) => route && sameUrl(href, route.href)));
  const reference: VendorRoute | undefined = referenceHref
    ? { href: referenceHref, label: referenceHref, purpose: "reference" } : undefined;
  return { contact, application, alternatives, official, reference };
}

export function vendorApplyAction(event: Event, now: number,
  route = applicationRoute(event), timing?: ReturnType<typeof vendorTiming>) {
  if (route && !event.event_status && upcoming(event, saigonDay(now)) && !(timing ?? vendorTiming(event, now)).closed)
    return routeAction(route);
}

type NextVendorAction = {
  sentence: string;
  label?: string;
  href?: string;
  purpose?: VendorPurpose;
  panel?: "planning" | "schedule" | "money" | "outreach" | "outreach-edit";
};
export function nextVendorAction(event: Event, stage: Stage, today: string,
  timing: ReturnType<typeof vendorTiming>, routes: ReturnType<typeof vendorRoutes>, hasPrice: boolean): NextVendorAction {
  const outreach = event.outreach ?? emptyOutreach;
  const reminder = followUp(outreach);
  const fallback = routes.official ?? routes.reference;
  const ask = routes.contact ? routeAction(routes.contact)
    : fallback ? routeAction(fallback) : { label: "Add contact route" };
  const application = upcoming(event, today) ? routes.application : undefined;
  const apply = application ? routeAction(application) : ask;
  const reviewOutreach: NextVendorAction = {
    label: "Log outreach", panel: "outreach-edit",
    sentence: "Log or review the exchange so Outreach reflects your pipeline stage.",
  };
  if (event.event_status === "cancelled") return {
    label: "Review planning", panel: "planning", sentence: "Review any reservations you made for the cancelled event.",
  };
  if (event.event_status === "postponed") return { ...ask, sentence: "Check with the organizer for the revised schedule." };
  if (stage === "Passed") return { label: "Review planning", panel: "planning", sentence: "Keep this event on file unless you change your pipeline decision." };
  if (stage === "Too expensive") return { ...ask, sentence: "Ask about a lower-cost eligible booth if you want to reconsider." };
  if (stage === "Need to pay") return { ...ask, sentence: "Confirm payment instructions with the organizer before paying." };
  if (stage === "Booked") return { label: "Review booking", panel: "schedule", sentence: "Review your booking before making travel arrangements." };
  if (stage === "Applied") return { ...ask, sentence: "Check with the organizer for confirmation of your application." };
  if (outreach.status === "not_contacted" && stage === "Contacted") return reviewOutreach;
  if (reminder?.kind === "reply") return { ...ask, sentence: "Reply to the organizer to continue the booth conversation." };
  if (outreach.status === "declined") return { label: "Review outreach", panel: "outreach", sentence: "Review the organizer’s decision before making plans." };
  if (stage === "Quote received" || outreach.status === "quoted" || outreach.quoted_price?.trim())
    return hasPrice
      ? { label: "Review booth pricing", panel: "money", sentence: "Review the booth pricing against your budget before confirming." }
      : { ...ask, sentence: "Confirm the applicable booth price with the organizer before booking." };
  if (outreach.status === "contacted") return reminder && reminder.due <= today
    ? { ...ask, sentence: "Follow up with the organizer for a response." }
    : { label: "Review outreach", panel: "outreach", sentence: "Wait for the organizer’s response." };
  if (timing.closed) return { ...ask, sentence: routes.contact
    ? "Ask the organizer whether there is a waitlist or another vendor route."
    : "Check for a waitlist or another vendor route now that applications have closed." };
  if (timing.awaitingOpening && application?.purpose !== "interest")
    return { ...apply, sentence: "Review the vendor route before booking opens." };
  if (outreach.status === "replied" && !hasPrice) return { ...ask, sentence: "Confirm the current booth price with the organizer." };
  if (application) return { ...apply, sentence: application.purpose === "interest"
    ? "Register interest through the organizer’s published route."
    : "Use the published vendor route to apply for a booth." };
  if (!routes.contact && fallback) return { ...ask, sentence: fallback.purpose === "official"
    ? "Look for vendor access and booking details on the official site."
    : "Review the available source while you wait for official vendor details." };
  if (!routes.contact) return { ...ask, sentence: "Add an organizer contact to confirm vendor details." };
  return { ...ask, sentence: hasPrice ? "Confirm booth availability with the organizer."
    : "Ask the organizer about vendor access and the current booth price." };
}
