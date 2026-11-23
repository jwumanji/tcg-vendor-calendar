import { load } from "cheerio";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import raw from "../../data/events.json";
import { canCompare, compareOccurrenceKey, compareOverlaps, resolveComparePins, selectCompareOccurrence, toggleComparePin, type ComparePin } from "../compare";
import { normalizeEvents } from "../data";
import { DEFAULT_HOME_BASE } from "../homeBase";
import { emptyFilters, type Event, type VendorMilestone } from "../model";
import { scoreEvent } from "../scoring";
import { emptyEntry, stageSuggestions, withSuggestedStages } from "../storage";
import { displayDateLabel, matchingEvent, overlappingDateRange } from "../utils";
import { CompareEvents, CompareTable, CompareTray } from "./CompareEvents";
import { Detail } from "./Detail";
import { EventCard } from "./EventCard";
import { EventRows } from "./EventRows";

const events = normalizeEvents(raw);
const event = (id: string) => events.find((e) => e.id === id)!;
const award = event("r-awardx");
const trade = event("r-tradeting");
const urban = event("urban");
const color = event("color18");
const caps = event("r-caps");
const today = "2026-11-24";
const now = Date.parse(today + "T03:00:00Z");
const noop = () => {};

function renderComparison(shows: Event[], options: Partial<React.ComponentProps<typeof CompareTable>> = {}) {
  const entries = withSuggestedStages({}, stageSuggestions(shows));
  const scores = Object.fromEntries(shows.map((e) => [e.id, scoreEvent(e, { today, now })]));
  const pins = resolveComparePins(shows.map(({ id }) => ({ id })), shows, shows, shows, today);
  return load(renderToStaticMarkup(
    <CompareEvents pins={pins} entries={entries} scores={scores} today={today} now={now}
      homeBase={DEFAULT_HOME_BASE.id} budgets={{}} onOccurrence={noop} close={noop} returnFocus={() => null} {...options} />,
  ));
}

function cell($: ReturnType<typeof load>, field: string, column: number) {
  return $("tbody tr").filter((_, row) => $(row).children("th").text() === field)
    .children("td").eq(column).children("div");
}

it("requires two pins, keeps insertion order, permits four and ignores a fifth", () => {
  let pins: ComparePin[] = [];
  expect(canCompare(pins)).toBe(false);
  for (const [index, show] of [color, trade, award, urban].entries()) {
    pins = toggleComparePin(pins, show, today);
    expect(pins).toHaveLength(index + 1);
    expect(canCompare(pins)).toBe(index > 0);
  }
  expect(toggleComparePin(pins, caps, today)).toBe(pins);
  pins = toggleComparePin(pins, trade, today);
  expect(pins.map(({ id }) => id)).toEqual([color.id, award.id, urban.id]);
  pins = toggleComparePin(pins, trade, today);
  expect(pins.map(({ id }) => id)).toEqual([color.id, award.id, urban.id, trade.id]);
});

it("pins the displayed filtered weekend and retains its whole date range after filtering it out", () => {
  const shown = matchingEvent(trade, { ...emptyFilters, from: "2027-03-14", to: "2027-03-14" }, {}, 0, today)!;
  expect(displayDateLabel(shown, today)).toBe("13–14 Mar 2027");
  let pins = toggleComparePin([], shown, today);
  pins = toggleComparePin(pins, award, today);
  const hidden = resolveComparePins(pins, [trade, award], [trade, award], [award], today);
  expect(hidden[0]).toMatchObject({ event: trade, range: { start_date: "2027-03-13", end_date: "2027-03-14" }, visible: false });
  expect(hidden[0].occurrences).toHaveLength(trade.occurrences!.length);
  expect(hidden[1].visible).toBe(true);
  const $ = load(renderToStaticMarkup(<CompareTray pins={hidden} trigger={{ current: null }} open={noop} remove={noop} />));
  expect($(".compare-pins button").map((_, button) => $(button).attr("aria-label")).get())
    .toEqual([`Remove ${trade.name} from comparison`, `Remove ${award.name} from comparison`]);
  expect($(".compare-pin small").text()).toBe("Outside current results");
  expect($(".compare-pin").first().attr("aria-describedby")).toBe($(".compare-pin small").attr("id"));
  expect($(".compare-pin").last().attr("aria-describedby")).toBeUndefined();
  expect($(".compare-trigger").is(":disabled")).toBe(false);
});

it("keeps published weekends distinct even when a moved weekend shares an original date", () => {
  const original = trade.occurrences![0];
  const moved = { ...original, start_date: "2027-01-16", end_date: "2027-01-17", original_start_date: original.start_date };
  const longer = { ...moved, end_date: "2027-01-18" };
  const updated = { ...trade, occurrences: [moved, original, longer, { ...original }] };
  const pins = toggleComparePin([], updated, today);
  const resolve = (selected: ComparePin[]) => resolveComparePins(selected, [updated], [updated], [], today)[0];
  expect(resolve(pins).range).toEqual(original);
  expect(resolve(pins).occurrences).toEqual([original, moved, longer]);
  for (const range of [moved, longer]) {
    expect(resolve(selectCompareOccurrence(pins, updated.id, compareOccurrenceKey(range))).range).toBe(range);
  }
});

it("shows event-level date certainty without treating tentative date ranges as published weekends", () => {
  const estimated = { ...trade, date_status: "estimated", estimated_month: "2027-01" } as const;
  const unannounced = { ...award, date_status: "tba" } as const;
  const $ = renderComparison([estimated, unannounced]);
  expect($(".compare-weekend").length).toBe(0);
  expect(cell($, "Dates and certainty", 0).text()).toContain("January 2027");
  expect(cell($, "Dates and certainty", 0).text()).not.toContain("2–3 Jan");
  expect(cell($, "Dates and certainty", 1).text()).toBe("◇ Dates not announced");
});

it("reports an inclusive overlap on the last day of one show and the first day of another", () => {
  const events = [color, urban];
  const resolved = resolveComparePins(events.map(({ id }) => ({ id })), events, events, [], today);
  const overlap = { start_date: "2027-01-10", end_date: "2027-01-10" };
  expect(compareOverlaps(resolved[0], resolved)).toEqual([{ event: urban, overlap }]);
  expect(compareOverlaps(resolved[1], resolved)).toEqual([{ event: color, overlap }]);
  expect(overlappingDateRange(award.occurrences![0], trade.occurrences![1])).toBeNull();
});

it.each([
  { date_status: "estimated" },
  { date_status: "tba" },
  { event_status: "cancelled" },
  { event_status: "postponed" },
] as const)("omits overlaps for a schedule marked %j", (status) => {
  const shows = [{ ...award, ...status }, trade];
  const pins = resolveComparePins(shows.map(({ id }) => ({ id })), shows, shows, shows, today);
  expect(compareOverlaps(pins[0], pins)).toEqual([]);
  expect(compareOverlaps(pins[1], pins)).toEqual([]);
});

it("updates overlaps and computes selling days and break-even for the chosen published weekend", () => {
  const overlapShow = { ...award, occurrences: [{ start_date: "2027-02-14", end_date: "2027-02-15" }] };
  const pricedCaps = { ...caps, vendor_cost: "USD 300 per booth" };
  const shows = [pricedCaps, overlapShow];
  const initial = shows.reduce((pins, show) => toggleComparePin(pins, show, today), [] as ComparePin[]);
  const defaults = { meals: { amount: 30, currency: "USD" } };
  const render = (pins: ComparePin[]) => renderComparison(shows, {
    defaults, pins: resolveComparePins(pins, shows, shows, shows, today),
  });
  const $before = render(initial);
  expect(cell($before, "Venue", 0).text()).toBe("Junction 8Singapore");
  expect(cell($before, "Eligible table fee", 0).text()).toContain("Listed priceper booth");
  expect(cell($before, "Confirmed overlap", 0).text()).toContain("14 Feb 2027");
  expect(cell($before, "Trip total for entered costs", 0).text()).toContain("USD 390.00");
  expect(cell($before, "Break-even per selling day", 0).find("small").map((_, el) => $before(el).text()).get())
    .toEqual(["USD 130.00", "3 selling days"]);
  const selected = compareOccurrenceKey(pricedCaps.occurrences![1]);
  const $after = render(selectCompareOccurrence(initial, pricedCaps.id, selected));
  expect($after("select option[selected]").attr("value")).toBe(selected);
  expect($after("select option")).toHaveLength(3);
  expect(cell($after, "Venue", 0).text()).toBe("City Square MallSingapore");
  expect(cell($after, "Confirmed overlap", 0).text()).toBe("No confirmed overlap");
  expect(cell($after, "Trip total for entered costs", 0).text()).toContain("USD 360.00");
  expect(cell($after, "Break-even per selling day", 0).find("small").map((_, el) => $after(el).text()).get())
    .toEqual(["USD 180.00", "2 selling days"]);
});

it("flags travel saved for a different home base and meal defaults missing a day count", () => {
  const estimated = { ...urban, date_status: "estimated", estimated_month: "2027-01" } as const;
  const $ = renderComparison([estimated, color], {
    budgets: { [urban.id]: { costs: { travel: { amount: 80, currency: "USD" } }, travelHomeBase: "th-bangkok" } },
    defaults: { meals: { amount: 30, currency: "USD" } },
  });
  const tripTotal = cell($, "Trip total for entered costs", 0).text();
  expect(tripTotal).toContain("Saved for Bangkok. Review this travel amount for Ho Chi Minh City.");
  expect(tripTotal).toContain("Enter lodging nights or meal days to apply the corresponding Tools default.");
  expect(cell($, "Break-even per selling day", 0).text()).toBe("Selling days are unconfirmed.");
});

it("shows useful missing rate reasons and leaves totals blank when there are no costs", () => {
  const shows = [event("scan-suntec-asia-comic-expo-005-202701"), event("r-offcenter"), event("jet-2027"), award];
  const $ = renderComparison(shows);
  const messages = [
    "TCG singles eligibility unclear. Applicable price pending.", "Only a multi-event bundle price is listed.",
    "Quote pending", "No booth price recorded.",
  ];
  for (const [index, message] of messages.entries()) {
    expect(cell($, "Eligible table fee", index).text()).toBe(message);
    expect(cell($, "Trip total for entered costs", index).text()).toBe("Total pending an applicable table fee.");
    expect(cell($, "Break-even per selling day", index).text()).not.toMatch(/USD|VND|\d/);
  }
  const withCost = renderComparison([award, urban], { budgets: { [award.id]: { costs: { travel: { amount: 80, currency: "USD" } } } } });
  expect(cell(withCost, "Trip total for entered costs", 0).text()).toContain("Known costs subtotal");
  expect(cell(withCost, "Trip total for entered costs", 0).text()).toContain("USD 80.00");
  expect(cell(withCost, "Break-even per selling day", 0).text()).toBe("Available when the trip total is known.");
});

it("excludes expired quotes and leaves the budget pending when a saved cost has no conversion rate", () => {
  const expired = { ...color, vendor_cost: null,
    vendor_options: [{ ...color.vendor_options![0], valid_until: "2026-11-22T00:00:00Z" }] };
  const $ = renderComparison([expired, urban], {
    budgets: { [urban.id]: { costs: { travel: { amount: 8000, currency: "JPY" } } } },
  });
  expect(cell($, "Eligible table fee", 0).text()).toBe("All booth rates have expired.");
  expect(cell($, "Eligible table fee", 1).text()).toContain("HKD 1,488");
  expect(cell($, "Trip total for entered costs", 1).text()).toContain("Total pending conversion");
  expect(cell($, "Break-even per selling day", 1).text()).toBe("Available when the trip total is known.");
});

it("matches Detail's effective stage and selected quote, with labelled columns and rows", () => {
  const shows = [event("mefcc-2027"), color];
  const entries = withSuggestedStages({ [color.id]: { ...emptyEntry, stage: "Considering" } }, stageSuggestions(shows));
  const $ = renderComparison(shows, { entries });
  const headers = $("th[scope=col]").slice(1);
  expect(headers.map((_, th) => $(th).text()).get()).toEqual(shows.map(({ name }) => name));
  expect($("dialog").attr("aria-labelledby")).toBe($("h2").attr("id"));
  for (const [index, show] of shows.entries()) {
    const detail = load(renderToStaticMarkup(<Detail e={show} entry={entries[show.id]} score={scoreEvent(show, { today, now })}
      today={today} now={now} toast={null} saved onStage={noop} onNote={noop} setGoing={noop} setOverride={noop}
      openClash={noop} onOutreach={noop} onMilestone={noop} onRemoveMilestone={noop} onVendorPricing={noop} />));
    const price = cell($, "Eligible table fee", index);
    expect(detail(".money-summary strong").text()).toContain(price.find("strong").text());
    expect(detail(".money-summary p").text()).toContain("Organizer quote");
    expect(price.text()).toContain("Organizer quote");
    expect(cell($, "Pipeline stage", index).text()).toContain(detail("#detail-stage option[selected]").text());
    expect(cell($, "Priority", index).find(".priority-chip").attr("aria-label"))
      .toBe(detail(".priority-chip").first().attr("aria-label"));
    const td = price.parent();
    expect(td.attr("headers")?.split(" ")).toEqual([headers.eq(index).attr("id"), td.siblings("th").attr("id")]);
    expect(td.children(".compare-mobile-name").text()).toBe(show.name);
  }
  expect(cell($, "Eligible table fee", 0).text()).toContain("AED 7,686Organizer quote · incl. VAT");
  expect(cell($, "Pipeline stage", 0).text()).toContain("Quote received");
  expect(cell($, "Pipeline stage", 1).text()).toBe("Considering");
});

it("shows only the earliest upcoming verified milestone and labels Apply and Register interest", () => {
  const base = urban.vendor_milestones![0];
  const milestone = (change: Partial<VendorMilestone>) => ({ ...base, ...change });
  const interest = { ...color, vendor_application: "https://example.com/register-interest/" };
  const first = {
    ...urban,
    vendor_milestones: [
      base,
      milestone({ id: "expired", at: "2026-11-20", label: "Past event" }),
      milestone({ id: "unverified", at: "2026-11-25", label: "Unverified date", verified: false }),
      milestone({ id: "opens", at: "2026-11-30", label: "Booking opens", type: "booking_opens" }),
    ],
  };
  const $ = renderComparison([first, interest]);
  expect(cell($, "Next verified milestone", 0).text()).toContain("Booking opens");
  expect(cell($, "Next verified milestone", 0).find("time").attr("datetime")).toBe("2026-11-30");
  expect(cell($, "Next verified milestone", 1).text()).toBe("No upcoming verified milestone");
  expect(cell($, "Vendor application", 0).find("a").attr("href")).toBe(first.vendor_application);
  expect(cell($, "Vendor application", 1).find("a").text()).toBe("Register interest");
  const $closed = renderComparison([first, { ...interest, event_status: "postponed" }], {
    now: Date.parse("2026-12-21T03:00:00Z"),
  });
  expect($closed(".apply-cta")).toHaveLength(0);
});

it("renders the shared pin state in Grid and Rows with ordinary stage and Going controls", () => {
  const score = scoreEvent(trade, { today, now });
  const comparison = { pins: [{ id: trade.id }], toggle: vi.fn() };
  const shared = { entries: {}, today, now, comparison, setGoing: noop, setStage: noop, open: noop };
  const grid = load(renderToStaticMarkup(<EventCard e={trade} score={score} entry={emptyEntry} {...shared} />));
  const rows = load(renderToStaticMarkup(<EventRows groups={new Map([["", [trade]]])} columns={[]}
    sort={{ key: "dates", direction: "asc" }} scores={{ [trade.id]: score }} {...shared} />));
  for (const $ of [grid, rows]) {
    expect($(".compare-toggle").attr("aria-pressed")).toBe("true");
    expect($(".compare-toggle").attr("aria-label")).toBe(`Pin ${trade.name} for comparison`);
    expect($(".stage-picker, .going-button")).toHaveLength(2);
  }
  expect(grid(".row-date-label").text()).toBe(rows(".row-date-label").text());
});
