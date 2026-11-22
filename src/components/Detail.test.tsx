import { readFileSync } from "node:fs";
import { load } from "cheerio";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import rawEvents from "../../data/events.json";
import { normalizeEvents } from "../data";
import { goingConflicts } from "../eventDecision";
import { dateLabel, seasonEvents } from "../utils";
import { emptyOutreach, type Event, type VendorMilestone } from "../model";
import { scoreEvent } from "../scoring";
import { emptyEntry } from "../storage";
import { Detail } from "./Detail";

const events = normalizeEvents(rawEvents);
function event(id: string) {
  return events.find((e) => e.id === id)!;
}

const today = "2026-11-21";
const now = Date.parse(today + "T18:00:00Z"); // 22 Nov in Saigon
const sparse: Event = {
  ...event("jet-2027"), name: "Sparse scan", id: "sparse", date_status: "tba", start_date: null,
  end_date: null, city: null, country: null, country_code: null, venue: null, organizer: null,
  vendor_booths: null, vendor_application: null, vendor_deadline: null, vendor_cost: null,
  vendor_options: [], vendor_documents: [], booth_detail: null, contact: null, outreach: null,
  website: null, instagram: null, source_urls: [], description: null, audience: null, fit: null,
  logo: null, event_type: "Unknown", region_group: null, games: [], expected_size: null,
  size_tier: null, size_note: null, visitors: null, vendor_count: null, previous_editions: null,
  previous_editions_count: null, first_year: null, is_new_find: true,
};

function render(e: Event, props: Partial<React.ComponentProps<typeof Detail>> = {}) {
  return load(renderToStaticMarkup(<Detail e={e} today={today} now={now}
    entry={emptyEntry} score={scoreEvent(e, { today, now })} saved
    setGoing={vi.fn()} onStage={vi.fn()} onNote={vi.fn()} onOutreach={vi.fn()}
    onMilestone={vi.fn()} onRemoveMilestone={vi.fn()} onVendorPricing={vi.fn()} onTripBudget={vi.fn()}
    setOverride={vi.fn()} openClash={vi.fn()} toast={null} {...props} />));
}

it("puts Decide and the next action before the ordered reference sections", () => {
  const $ = render(event("color18"), { entry: { ...emptyEntry, stage: "Considering" } });
  expect($(".event-decision > h2").text()).toBe("Decide");
  expect($(".decision-reason + .decision-stage + .next-step + .decision-facts")).toHaveLength(1);
  expect($(".event-information > details > summary .detail-summary-label").map((_, el) => $(el).text()).get()).toEqual([
    "Outreach", "Money", "Budget / break-even", "When and where", "Your planning", "About", "Score breakdown", "Sources",
  ]);
  expect($(".event-information > details[open] > summary .detail-summary-label").map((_, el) => $(el).text()).get()).toEqual([
    "Outreach", "Money", "Budget / break-even",
  ]);
  expect($(".event-facts .going-button")).toHaveLength(1);
  expect($(".event-facts select")).toHaveLength(0);
  expect($(".event-decision #detail-stage").attr("aria-label")).toBe("Pipeline stage for Color Fiesta #18: Bon Appétit");
  expect($("#detail-stage option[selected]").text()).toBe("Considering");
  expect($(".planning").text()).toContain("Change the pipeline stage in Decide.");
});

it("leads a sparse find with missing facts and keeps editors reachable without empty reference panels", () => {
  const $ = render(sparse);
  expect($(".event-decision").text()).toContain("Current booth price unknown");
  expect($(".event-decision").text()).toContain("No contact route found");
  expect($(".event-decision").text()).toContain("No vendor deadline published");
  expect($(".event-decision").text()).toContain("Travel originHo Chi Minh City, Vietnam");
  expect($(".event-decision").text()).not.toContain("Travel time");
  expect($(".decision-links").text()).toBe("Log a quote");
  expect($(".next-step .primary").text()).toBe("Add contact route");
  expect($(".event-information > details > summary .detail-summary-label").map((_, el) => $(el).text()).get()).toEqual([
    "Outreach", "Your planning", "Score breakdown",
  ]);
  expect($(".planning").parent().text()).toContain("Set up trip budget");
});

it("assigns the mobile artwork below the decision and keeps Going and the primary action inline", () => {
  const $ = render(sparse);
  const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");
  expect($(".event-artwork .generated-cover")).toHaveLength(1);
  expect(css).toContain('grid-template-areas: "identity" "decide" "artwork" "reference"');
  expect(css).toMatch(/\.event-artwork \{ grid-area: artwork;/);
  expect($(".event-identity .going-button, .next-step .primary")).toHaveLength(2);
  expect($(".event-layout > footer, .event-layout [class*='sticky-bottom']")).toHaveLength(0);
});

it.each([
  ["Application route", { vendor_booths: "Yes, exhibitor applications", vendor_application: "https://example.com/apply" }, "Apply", "https://example.com/apply"],
  ["Interest route", { vendor_application: "https://example.com/expressions-of-interest/" }, "Register interest", "https://example.com/expressions-of-interest/"],
  ["Interest notice only", { vendor_booths: "Yes (register interest)", website: "https://example.com/" }, "Check official site", "https://example.com/"],
  ["Organizer email", { contact: "sales@example.com" }, "Ask organizer", "mailto:sales@example.com"],
  ["Organizer WhatsApp", { contact: "WhatsApp +852 6908 4844 (Mark)" }, "Ask organizer", "https://wa.me/85269084844"],
  ["Official site only", { website: "https://example.com/" }, "Check official site", "https://example.com/"],
] as const)("labels the primary button for %s", (_, overrides, label, href) => {
  const $ = render({ ...sparse, ...overrides });
  const selector = label === "Apply" || label === "Register interest" ? ".apply-cta" : ".primary";
  expect($(".next-step a.button")).toHaveLength(1);
  expect($(".next-step " + selector).text()).toBe(label);
  expect($(".next-step " + selector).attr("href")).toBe(href);
});

it("shows apply-by with a countdown only when a clear closing milestone has been recorded", () => {
  const vendor_deadline = "Vendor applications close 25 Nov 2026";
  const base = { ...sparse, vendor_deadline };
  expect(render(base)(".decision-facts").text()).toContain("Apply by" + vendor_deadline);
  expect(render(base)(".decision-countdown")).toHaveLength(0);
  const closes: VendorMilestone = { id: "closing", type: "application_closes", at: "2026-11-25", timeZone: "Asia/Ho_Chi_Minh",
    label: "Vendor applications close", verified: true, source: "Organizer notice" };
  const $ = render({ ...base, vendor_milestones: [closes] });
  expect($(".decision-facts").text()).toContain("Apply by");
  expect($(".decision-countdown").text()).toBe("in 3 days");
  expect($(".booking-milestones .milestone-export")).toHaveLength(1);
});

it("keeps Card Con FCFS and the closed priority window distinct from a deadline", () => {
  const $ = render(event("cardcon3"));
  expect($(".decision-facts").text()).toContain("First come, first served");
  expect($(".decision-facts").text()).toContain("returning-exhibitor priority window has closed");
  expect($(".decision-facts").text()).not.toContain("Apply by");
  expect($(".decision-countdown").text()).toBe("in 8 days");
  expect($(".next-step .apply-cta").text()).toBe("Apply");
});

it.each([
  ["Applications are rolling while space lasts", "Rolling applications"],
  ["Applications closed 18 Oct 2026", "Vendor notice"],
])("preserves timing wording for %s", (vendor_deadline, label) => {
  const $ = render({ ...sparse, vendor_deadline });
  expect($(".decision-facts").text()).toContain(label + vendor_deadline);
  expect($(".decision-countdown")).toHaveLength(0);
});

it("keeps the package, currency, VAT and conditions on the applicable price line", () => {
  const e = event("mefcc-2027");
  const extra = { ...e.vendor_options![0], name: "Cheaper published option", basis: "published" as const,
    id: "published", amount: 400, amount_incl_vat: 420 };
  const quoted = render({ ...e, vendor_options: [extra, ...e.vendor_options!] });
  expect(quoted(".decision-price dd").text()).toContain("AED 7,686 incl. VAT · Shell scheme 4 sqm · 4 m² · This-edition quote · Includes AED 920 listing fee.");
  expect(quoted(".decision-price").text()).not.toContain(extra.name);
  const published = render({ ...e, vendor_options: [extra], vendor_cost: "AED 100 per booth" });
  expect(published(".decision-price").text()).toContain("AED 420 incl. VAT · Cheaper published option");
  expect(render({ ...sparse, vendor_cost: "SGD 75 per 180 cm table, two days" })(".decision-price").text())
    .toContain("Listed · SGD 75 per 180 cm table, two days");
});

it("keeps expired, unclear, ineligible and historical rates in Money", () => {
  const e = event("scan-suntec-asia-comic-expo-005-202701");
  const $ = render({ ...e, vendor_cost: "SGD 250 prior-edition rate",
    vendor_options: [...e.vendor_options!, { ...e.vendor_options![0], id: "ineligible", eligibility: "ineligible" }] });
  expect($(".decision-price").text()).toContain("Current booth price unknown");
  expect($(".decision-price").text()).not.toMatch(/SGD|250|350/);
  expect($(".vendor-money").text()).toContain("Past-year rate");
  expect($(".vendor-money").text()).toContain("Expired early bird");
  expect($(".vendor-money").text()).toContain("Ineligible");
  expect($(".vendor-money tr[data-applicable='true']")).toHaveLength(0);
});

it("keeps the score breakdown collapsed with the configured origin and manual score visible", () => {
  const e = event("cardcon3");
  const score = scoreEvent(e, { today, now, overrides: { [e.id]: 87 } });
  const $ = render(e, { homeBase: "au-sydney", score });
  const summary = $(".event-information > details > summary").filter((_, el) =>
    $(el).find(".detail-summary-label").text() === "Score breakdown");
  expect(summary.parent().attr("open")).toBeUndefined();
  expect($(".decision-score").text()).toContain("87");
  expect($(".decision-score").text()).toContain("Manual score");
  expect($(".decision-facts").text()).toContain("Travel originSydney, Australia");
});

it("keeps saved 2026 Going conflicts when hidden and dates each recurring overlap", () => {
  const early = { start_date: "2026-12-30", end_date: "2026-12-31" };
  const late = { start_date: "2027-01-06", end_date: "2027-01-07" };
  const e = { ...event("cardcon3"), ...early, occurrences: [early, late] };
  const hidden = { ...e, ...early, occurrences: undefined, id: "hidden", name: "Hidden Going event" };
  const series = { ...e, id: "series", name: "Recurring Going event",
    occurrences: [early, { ...late, start_date: late.end_date }] };
  const eligible = [e, hidden, series, { ...hidden, id: "unmarked" },
    { ...hidden, id: "estimated", date_status: "estimated" as const }];
  const entries = Object.fromEntries(["hidden", "series", "estimated"].map((id) =>
    [id, { ...emptyEntry, going: true }]));
  const visible = seasonEvents(eligible, false);
  expect(visible.map(({ id }) => id)).not.toContain(hidden.id);
  expect(visible[0].occurrences).toEqual([late]);
  const conflicts = goingConflicts(e, eligible, entries, today);
  expect(conflicts).toEqual([
    { id: hidden.id, name: hidden.name, date: "30 Dec 2026 – 31 Dec 2026" },
    { id: series.id, name: series.name, date: "30 Dec 2026 – 31 Dec 2026" },
    { id: series.id, name: series.name, date: "7 Jan 2027" },
  ]);
  expect(goingConflicts(e, eligible, entries, today, dateLabel({ ...e, ...late }))).toEqual([conflicts[2]]);
  const $ = render(visible[0], { conflicts });
  expect($(".decision-conflicts li").map((_, li) => $(li).text()).get()).toEqual([
    "Hidden Going event · 30 Dec 2026 – 31 Dec 2026",
    "Recurring Going event · 30 Dec 2026 – 31 Dec 2026",
    "Recurring Going event · 7 Jan 2027",
  ]);
  expect($(".priority-detail .clash-note")).toHaveLength(0);
});

it("counts waits on the Saigon calendar and retains pipeline and no-reply instructions", () => {
  const base = { ...sparse, contact: "noreply@example.com; vendor@example.com",
    outreach: { ...emptyOutreach, status: "contacted" as const, method: "email" as const,
      contacted_at: today, notes: "Do not auto-reply to the acknowledgement." } };
  const $ = render(base, { entry: { ...emptyEntry, stage: "Considering" } });
  expect($(".decision-stage option[selected]").text()).toBe("Considering");
  expect($(".outreach-summary").text()).toContain("ContactedEmail");
  expect($(".outreach-summary").text()).toContain("Waiting 1 day");
  expect($(".outreach-section").text()).toContain("Do not auto-reply");
  expect($('a[href="mailto:noreply@example.com"]')).toHaveLength(0);
  expect($(".outreach-edit").attr("open")).toBeUndefined();
  expect(render({ ...base, outreach: { ...base.outreach, status: "replied" } })(".outreach-summary").text()).not.toContain("Waiting");
  expect(render({ ...base, outreach: { ...base.outreach, contacted_at: null } })(".outreach-summary").text()).not.toContain("Waiting");
});

it.each([
  ["def-gameexpo", "Check official site", "https://www.dubaiesportsfestival.com/en/home", "https://uprizing.ae/the-narrows"],
  ["paperworld", "Ask organizer", "mailto:paperworld@uae.messefrankfurt.com", "https://paperworld-middle-east.ae.messefrankfurt.com/dubai/en/exhibitors/faq.html"],
  ["urban", "Apply", "https://docs.google.com/forms/d/e/1FAIpQLSeulGNKHBEi5UgHtx-IBqt6NyjihmQAyrXSBOYCKF953o62Jg/viewform", "https://urbanops.hk/urban-card-show-2027-01/"],
  ["comfest-kw", "View reference source", "https://playvault.ae/pages/tcg-event-calendar-2026-gcc", "https://playvault.ae/pages/tcg-event-calendar-2026-gcc"],
  ["bahrain-cs", "View reference source", "https://playvault.ae/pages/tcg-event-calendar-2026-gcc", "https://playvault.ae/pages/tcg-event-calendar-2026-gcc"],
])("uses the published route with the matching purpose for %s", (id, label, href, source) => {
  const $ = render(event(id));
  const action = $(".next-step a.button");
  expect(action.text()).toBe(label);
  expect(action.attr("href")).toBe(href);
  expect(action.hasClass("apply-cta")).toBe(label === "Apply");
  expect($(`.source-links a[href="${source}"]`)).toHaveLength(1);
  if (id === "comfest-kw" || id === "bahrain-cs") {
    expect($(".next-step a")).toHaveLength(1);
    expect($(".event-layout a").text()).not.toMatch(/Ask organizer|Official website/);
  }
});

it("ignores application links identified as belonging to another edition", () => {
  const $ = render({ ...sparse, start_date: "2027-09-23",
    vendor_application: "2026 registration: https://example.com/apply; https://example.com/2026/register-interest",
    website: "https://example.com/" });
  expect($(".next-step .primary").text()).toBe("Check official site");
});

it("uses the verified general close for FCFS and keeps the returning window separate", () => {
  const e = event("cardcon3");
  const close = { ...e.vendor_milestones![0], id: "general-close", type: "application_closes" as const,
    at: "2026-12-09", label: "General applications close", notes: undefined };
  const returning = { ...close, id: "returning-close", label: "Returning exhibitors only", at: "2026-11-18" };
  const milestones = [...e.vendor_milestones!, returning, close];
  const adjusted = { ...e, vendor_milestones: milestones };
  const open = render(adjusted, { now: Date.parse("2026-12-09T14:00:00Z") });
  expect(open(".next-step .apply-cta").text()).toBe("Apply");
  expect(open(".decision-facts").text()).toContain("Apply by");
  const closed = render(adjusted, { now: Date.parse("2026-12-09T17:00:00Z") });
  expect(closed(".next-step .primary").text()).toBe("Ask organizer");
  expect(closed(".next-step .apply-cta")).toHaveLength(0);
  expect(closed(".next-step").text()).toContain("waitlist");
  expect(closed(".decision-facts").text()).toContain("Applications closed");
});

it("summarizes the selected listed rate and retains the original price text in Money", () => {
  const vendor_cost = "SGD 350 per table for 2027; SGD 250 (2026)";
  const $ = render({ ...sparse, start_date: "2027-02-01", vendor_cost });
  expect($(".decision-price").text()).toBe("Booth priceListed · SGD 350 per table for 2027");
  expect($(".vendor-money").text()).toContain(vendor_cost);
});

it.each([
  ["Contacted", "Log outreach", "Log or review the exchange"],
  ["Applied", "Ask organizer", "confirmation of your application"],
  ["Need to pay", "Ask organizer", "Confirm payment instructions"],
  ["Booked", "Review booking", "Review your booking before making travel arrangements"],
  ["Passed", "Review planning", "Keep this event on file"],
  ["Too expensive", "Ask organizer", "lower-cost eligible booth"],
] as const)("uses the next action for %s without a recorded exchange", (stage, label, sentence) => {
  const $ = render({ ...sparse, contact: "sales@example.com" }, { entry: { ...emptyEntry, stage } });
  expect($(".next-step .primary").text()).toBe(label);
  expect($(".next-step p").text()).toContain(sentence);
  expect($("#detail-stage option[selected]").text()).toBe(stage);
  expect($(".outreach-summary").text()).toBe("Not contacted");
});

it("keeps Apply available beside the quote review when the organizer has an open route", () => {
  const $ = render(event("urban"), { entry: { ...emptyEntry, stage: "Quote received" } });
  expect($(".next-step .primary").text()).toBe("Review booth pricing");
  expect($(".next-step .apply-cta").text()).toBe("Apply");
  expect($(".outreach-research .apply-cta").attr("href")).toBe($(".next-step .apply-cta").attr("href"));
  expect($(".going-button").hasClass("apply-cta")).toBe(false);
});

it("keeps the reply and missing price visible for Japan Expo Thailand's proposal", () => {
  const $ = render(event("jet-2027"), { entry: { ...emptyEntry, stage: "Quote received" } });
  expect($(".next-step p").text()).toContain("Reply to the organizer");
  expect($(".decision-price").text()).toContain("Current booth price unknown");
});

it("puts a budget calculated from Tools defaults in the reference order", () => {
  const $ = render({ ...sparse, date_status: "confirmed", start_date: "2027-01-06", end_date: "2027-01-07" },
    { budgetDefaults: { meals: { amount: 100, currency: "VND" } } });
  const labels = $(".event-information > details > summary .detail-summary-label").map((_, el) => $(el).text()).get();
  expect(labels.slice(0, 4)).toEqual(["Outreach", "Budget / break-even", "When and where", "Your planning"]);
  expect($(".event-information").text()).not.toContain("Set up trip budget");
  expect($(".trip-budget").text()).toContain("VND 200");
  expect($(".trip-budget").text()).toContain("Known costs subtotal");
});
