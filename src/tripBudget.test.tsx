import { load } from "cheerio";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import raw from "../data/events.json";
import { TripBudget } from "./components/TripBudget";
import { VendorMoney } from "./components/VendorMoney";
import { normalizeEvents } from "./data";
import { emptyOutreach, type Event, type TripBudget as Budget } from "./model";
import { backup, importTripBudget, loadEntries, stashBeforeReplace, unknownIds, validateBackup } from "./storage";
import { budgetOrigin, calculateTripBudget, convertBudgetAmount, readTripBudgetForm, sellingDays, walkAwayPrice } from "./tripBudget";
import { occurrenceOn } from "./utils";
import { budgetFxDate } from "./vendorPricing";

const events = normalizeEvents(raw);
const find = (id: string) => events.find((event) => event.id === id)!;
const urban = find("urban");
const quote = find("zubculture").vendor_options![0];
const now = Date.parse("2026-11-21T12:00+07:00");
const today = "2026-11-21";
const money = (amount: number, currency = "VND") => ({ amount, currency });
const budgetFor = (event: Event, budget?: Budget) => calculateTripBudget(event, now, today, undefined, undefined, budget);

it.each([
  ["SGD", 1.290845], ["AED", 3.6725], ["VND", 25729.721904], ["THB", 33.94469],
  ["HKD", 7.844282], ["AUD", 1.498714], ["USD", 1],
])("converts %s through USD at the snapshot rate without intermediate rounding", (currency, rate) => {
  const converted = convertBudgetAmount(money(100, currency));
  expect(converted?.usd).toBeCloseTo(100 / rate, 10);
  expect(converted?.vnd).toBeCloseTo(100 / rate * 25729.721904, 8);
});

it.each(["JPY", "MYR", "toString"])("returns no conversion when %s has no snapshot rate", (currency) => {
  expect(convertBudgetAmount(money(100, currency))).toBeNull();
});

it("adds payable booth fees, travel and custom costs, and divides the unrounded total by selling days", () => {
  const extra = { costs: { travel: money(250, "SGD") }, custom: [{ id: "fees", label: "Payment fees", ...money(125000) }] };
  const budget = budgetFor(urban, extra);
  const usd = 1488 / 7.844282 + 250 / 1.290845 + 125000 / 25729.721904;
  expect(budget.tableFee).toMatchObject({ amount: 1488, currency: "HKD" });
  expect(budget.total?.usd).toBeCloseTo(usd, 10);
  expect(budget.total?.vnd).toBeCloseTo(usd * 25729.721904, 7);
  expect(budget.perDay?.usd).toBeCloseTo(usd / 2, 10);
  expect(budget.perDay?.vnd).toBeCloseTo(usd * 25729.721904 / 2, 7);
});

function renderBudget(event: Event, local?: Budget) {
  return load(renderToStaticMarkup(<TripBudget event={event} now={now} today={today} local={local} />));
}

it.each([
  [5_000, "50%", "USD 600.00", "USD 300.00", 2],
  [10_000, "100%", "USD 300.00", "USD 150.00", 1],
])("uses a margin of %i basis points alongside the existing trip target", (contributionMarginBps, label, total, daily, multiplier) => {
  const event = { ...urban, vendor_options: [], vendor_cost: "USD 250" };
  const local = { costs: { travel: money(50, "USD") }, travelHomeBase: "th-bangkok", contributionMarginBps };
  const budget = budgetFor(event, local);
  expect(budget.total?.usd).toBe(300);
  expect(budget.perDay?.usd).toBe(150);
  expect(budget.salesTarget?.total).toEqual({ usd: 300 * multiplier, vnd: budget.total!.vnd * multiplier });
  expect(budget.salesTarget?.perDay).toEqual({ usd: 150 * multiplier, vnd: budget.perDay!.vnd * multiplier });

  const $ = renderBudget(event, local);
  const target = $(".trip-budget-totals dt").filter((_, row) => $(row).text() === "Sales target at your margin").next();
  expect(target.find("strong").text()).toMatch(/^VND .* · USD /);
  expect(target.find("strong").text()).toContain(total);
  expect(target.text()).toContain(`${label} contribution margin`);
  expect(target.text()).toContain(`${daily} per selling day`);
  expect($(".trip-budget-totals strong").first().text()).toContain("USD 300.00");
  expect($(".trip-budget-fx").text()).toContain(budgetFxDate);
  expect($(".trip-budget-costs").text()).toContain("Saved for Bangkok. Review this travel amount for Ho Chi Minh City.");
});

it("keeps the trip target visible at 0% and explains why the sales target is unavailable", () => {
  const local = { contributionMarginBps: 0 };
  const budget = budgetFor(urban, local);
  expect(budget.total).not.toBeNull();
  expect(budget.salesTarget).toMatchObject({ total: null, perDay: null });
  const $ = renderBudget(urban, local);
  expect($(".trip-budget-totals").text()).toContain("0% contribution margin");
  expect($(".trip-budget-totals").text()).toContain("No finite sales target.");
  expect($(".trip-budget-totals strong")).toHaveLength(2);
});

it("shows the margin target without a daily amount when selling days are unknown", () => {
  const event = { ...urban, date_status: "tba" as const };
  const local = { contributionMarginBps: 5_000 };
  expect(budgetFor(event, local).salesTarget?.total).not.toBeNull();
  expect(budgetFor(event, local).salesTarget?.perDay).toBeNull();
  const $ = renderBudget(event, local);
  expect($(".trip-budget-totals").text()).toContain("Sales target at your margin");
  expect($(".trip-budget-totals").text()).toContain("Selling days are unknown");
  expect($(".trip-budget-totals").text()).not.toContain("per selling day");
});

it("leaves the trip total intact when a very small margin would overflow the sales target", () => {
  const result = budgetFor(urban, { costs: { freight: money(Number.MAX_VALUE / 2) }, contributionMarginBps: 1 });
  expect(result.total).not.toBeNull();
  expect(result.salesTarget).toMatchObject({
    total: null, perDay: null, message: "Sales target exceeds the supported amount.",
  });
});

it("clears the margin without clearing the costs or bringing back a shared margin", () => {
  const event = { ...urban, trip_budget: { contributionMarginBps: 10_000 } };
  const budget = { costs: { travel: money(200) }, contributionMarginBps: 5_000 };
  const fields = new FormData();
  fields.set("travel-amount", "200");
  fields.set("contributionMargin", "");
  const cleared = readTripBudgetForm(fields, [], budgetFor(event, budget).extraCosts, "vn-ho-chi-minh-city", budget);
  expect(cleared.costs).toEqual(budget.costs);
  expect(cleared).not.toHaveProperty("contributionMarginBps");
  expect(budgetFor(event, cleared).salesTarget).toBeNull();
  const $ = renderBudget(event, cleared);
  expect($(".trip-budget-totals").text()).not.toContain("Sales target at your margin");
  expect($(".trip-budget-totals").text()).toContain("Break-even sales per selling day");
  expect(budgetFor(urban).salesTarget).toBeNull();
});

it.each([["0", 0], ["28.99", 2_899], ["50", 5_000], ["100", 10_000]])(
  "saves %s percent as %i basis points",
  (value, expected) => {
    const fields = new FormData();
    fields.set("contributionMargin", value);
    const budget = readTripBudgetForm(fields, [], budgetFor(urban).extraCosts, "vn-ho-chi-minh-city");
    expect(budget.contributionMarginBps).toBe(expected);
  },
);

it.each(["-1", "100.01", "12.345", "invalid"])("rejects an invalid margin of %s percent", (value) => {
  const fields = new FormData();
  fields.set("contributionMargin", value);
  expect(() => readTripBudgetForm(fields, [], budgetFor(urban).extraCosts, "vn-ho-chi-minh-city"))
    .toThrow(/Enter a contribution margin/);
});

it("uses VAT-inclusive prices and recalculates conversions from payable amounts, ignoring cached USD", () => {
  const mefcc = find("mefcc-2027");
  const vendor_options = [{ ...mefcc.vendor_options![0], usd_amount: 1 }];
  expect(budgetFor({ ...mefcc, vendor_options }).total?.usd).toBeCloseTo(7686 / 3.6725, 10);
});

it.each([
  ["HKD", 100],
  ["USD", 15],
] as const)("uses the snapshot when comparing a HKD 200 option against %s %s", (currency, amount) => {
  const option = urban.vendor_options![0];
  const event = { ...urban, vendor_options: [
    { ...option, amount: 200, fx_rate: 1000, usd_amount: 0.2 },
    { ...option, id: "lower-payable", name: "Lower payable package", currency, amount, fx_rate: 1, usd_amount: amount },
  ] };
  const price = budgetFor(event).tableFee;
  expect(price).toMatchObject({ amount, currency, option: { id: "lower-payable" } });
  const $ = load(renderToStaticMarkup(<VendorMoney event={event} now={now} />));
  expect($(".money-summary strong").text()).toContain(`${currency} ${amount} · USD`);
  expect($('tr[data-applicable="true"] .money-option-name').text()).toBe("Lower payable package");
});

it("recalculates from live pricing when an eligible quote arrives or a published rate expires", () => {
  const listed = { ...urban, vendor_options: [], vendor_cost: "SGD 150" };
  const updated = { ...listed, vendor_options: [quote] };
  expect(budgetFor(listed).total?.usd).toBeCloseTo(150 / 1.290845, 10);
  expect(budgetFor(updated).total?.usd).toBeCloseTo(280 / 1.290845, 10);
  const expired = { ...urban, vendor_options: [{ ...quote, valid_until: "2026-11-21T12:00:00+07:00" }] };
  expect(budgetFor(expired).tableFee).toBeNull();
});

it("counts Urban's two inclusive calendar days and handles same-day and month/year boundaries", () => {
  expect(sellingDays(urban, today)).toBe(2);
  expect(sellingDays({ ...urban, end_date: urban.start_date }, today)).toBe(1);
  expect(sellingDays({ ...urban, start_date: "2027-12-31", end_date: "2028-01-02" }, today)).toBe(3);
});

it("uses the occurrence the page shows, with no combined itinerary", () => {
  const event = {
    ...urban,
    occurrences: [
      { start_date: "2027-01-09", end_date: "2027-01-10" },
      { start_date: "2027-02-01", end_date: "2027-02-03" },
    ],
  };
  expect(sellingDays(event, today)).toBe(2);
  expect(sellingDays(event, "2027-01-11")).toBe(3);
  expect(sellingDays(event, today, occurrenceOn(event, "2027-02-02"))).toBe(3);
});

it.each([
  { start_date: null }, { end_date: null }, { end_date: "2027-01-01" }, { end_date: "2027-02-30" },
  { date_status: "tba" }, { date_status: "estimated" }, { event_status: "postponed" },
] as const)("shows a total without break-even on an unknown schedule (%j)", (dates) => {
  const [event] = normalizeEvents([{ ...urban, ...dates }]);
  const result = budgetFor(event);
  expect(result.days).toBeNull();
  expect(result.total).not.toBeNull();
  expect(result.perDay).toBeNull();
  const $ = load(renderToStaticMarkup(<TripBudget event={event} now={now} today={today} />));
  expect($(".trip-budget-totals").text()).toContain("Selling days are unknown");
  expect($(".trip-budget-totals").text()).toContain("gross sales to cover trip costs, before cost of goods");
  expect($(".trip-budget-totals").text()).not.toContain("Break-even sales per selling day");
});

it("uses the known public price while outreach is contacted", () => {
  const event = { ...urban, vendor_options: [], vendor_cost: "SGD 190",
    outreach: { ...emptyOutreach, status: "contacted" as const } };
  expect(walkAwayPrice(event, now)).toMatchObject({ ceiling: money(190, "SGD"), basis: "listed", quote: null, above: null });
});

it("gives published rates priority over listed rates for the ceiling and compares eligible quotes across currencies", () => {
  const event = {
    ...urban, vendor_cost: "SGD 10",
    vendor_options: [quote, { ...quote, id: "public", basis: "published" as const, amount: 200, currency: "USD" }],
  };
  expect(walkAwayPrice(event, now)).toMatchObject({ ceiling: money(200, "USD"), basis: "published", above: true });
  expect(walkAwayPrice(event, now, money(250, "USD"))).toMatchObject({ basis: "custom", above: false });
  expect(walkAwayPrice(event, now, money(280, "SGD")).above).toBe(false);
  expect(walkAwayPrice(event, now, money(1, "JPY")).above).toBeNull();
});

it("falls back to the eligible listed ceiling with an existing quote, and accepts a zero custom ceiling", () => {
  const event = { ...urban, vendor_options: [quote], vendor_cost: "SGD 125" };
  expect(walkAwayPrice(event, now)).toMatchObject({ ceiling: money(125, "SGD"), basis: "listed", above: true });
  expect(walkAwayPrice(event, now, money(0, "SGD"))).toMatchObject({ ceiling: money(0, "SGD"), above: true });
});

it("keeps the listed benchmark when the quote matches its price before VAT", () => {
  const listed = { ...urban, vendor_options: [], vendor_cost: "SGD 280 per booth" };
  const quoted = { ...listed, vendor_options: [{ ...quote, vat_rate: 0.09, amount_incl_vat: 305.2 }] };
  expect(budgetFor(listed).tableFee).toMatchObject({ basis: "listed", amount: 280 });
  expect(budgetFor(quoted).tableFee).toMatchObject({ basis: "quote", amount: 305.2 });
  expect(walkAwayPrice(quoted, now)).toMatchObject({ ceiling: money(280, "SGD"), basis: "listed", above: true });
  const $ = load(renderToStaticMarkup(<TripBudget event={quoted} now={now} today={today} />));
  expect($('[role="alert"]').text()).toMatch(/^Above walk-away:/);
});

it.each([
  ["tcg-con-arabia", "prior-edition"], ["scan-suntec-asia-comic-expo-005-202701", "eligibility unclear"],
  ["jet-2027", "Quote pending"],
])("shows %s's missing-price reason without inventing a table fee or ceiling", (id, message) => {
  const event = find(id);
  const $ = load(renderToStaticMarkup(<TripBudget event={event} now={now} today={today} />));
  expect($(".trip-budget").text()).toContain(message);
  expect($(".trip-budget").text()).toContain("Walk-away fee cannot be set yet");
  expect(budgetFor(event).tableFee).toBeNull();
  expect(walkAwayPrice(event, now).ceiling).toBeNull();
});

it("accepts a user ceiling for Japan Expo without counting it as a table fee", () => {
  const event = find("jet-2027");
  const ceiling = money(8000, "THB");
  expect(walkAwayPrice(event, now, ceiling)).toEqual({ ceiling, basis: "custom", quote: null, above: null });
  expect(budgetFor(event, { walkAway: ceiling }).total).toBeNull();
});

it("ignores unclear Supa-Market options and uses the live shell price and ceiling", () => {
  const event = find("scan-supanova-supanova-comic-con-gaming-gold-coast-202704");
  expect(budgetFor(event).tableFee).toMatchObject({ option: { id: "shell-early" } });
  expect(walkAwayPrice(event, now).ceiling).toMatchObject({ option: { id: "shell-early" } });
});

it("retains known extras as a subtotal and withholds break-even for a cancelled event", () => {
  const event = { ...urban, event_status: "cancelled" as const };
  const local = { costs: { freight: money(300000) } };
  const budget = budgetFor(event, local);
  expect(budget).toMatchObject({ tableFee: null, total: null, perDay: null, days: null });
  expect(budget.subtotal?.vnd).toBeCloseTo(300000);
  expect(walkAwayPrice(event, now)).toMatchObject({ ceiling: null, quote: null });
  const $ = load(renderToStaticMarkup(<TripBudget event={event} now={now} today={today} local={local} />));
  expect($(".trip-budget").text()).toContain("Event cancelled.");
  expect($(".trip-budget").text()).toContain("Known costs subtotal");
});

it("keeps unsupported nonzero expenses visible without reporting a misleading complete total", () => {
  const local = { costs: { freight: money(100, "JPY"), travel: money(0, "JPY") }, contributionMarginBps: 5_000 };
  const $ = load(renderToStaticMarkup(<TripBudget event={urban} now={now} today={today} local={local} />));
  expect($(".trip-budget").text()).toContain("No snapshot FX rate for JPY.");
  expect($(".trip-budget-totals").text()).toContain("Known costs subtotal");
  expect($(".trip-budget-totals").text()).toContain("Sales target pending until the trip total is known.");
  expect(budgetFor(urban, local).salesTarget).toMatchObject({ total: null, perDay: null });
  expect($(".trip-budget-costs").text()).toContain("TravelJPY 0");
  expect($(".trip-budget-costs dd").filter((_, row) => $(row).text().includes("No snapshot FX rate"))).toHaveLength(1);
  expect(budgetFor(urban, { costs: { travel: money(0, "JPY") } }).total).not.toBeNull();
});

it("keeps the entered costs subtotal and leaves sales pending without an applicable booth fee", () => {
  const event = { ...urban, vendor_options: [], vendor_cost: null };
  const local = { costs: { travel: money(200, "USD") }, contributionMarginBps: 5_000 };
  const result = budgetFor(event, local);
  expect(result.subtotal?.usd).toBe(200);
  expect(result.total).toBeNull();
  expect(result.salesTarget).toMatchObject({ total: null, perDay: null });
  const $ = renderBudget(event, local);
  expect($(".trip-budget-totals").text()).toContain("Total pending an applicable table fee.");
  expect($(".trip-budget-totals").text()).toContain("Sales target pending until the trip total is known.");
  expect($(".trip-budget-totals strong").map((_, row) => $(row).text()).get()).toEqual([
    expect.stringContaining("USD 200.00"),
  ]);
});

it("uses the home-base city in the budget and suggests zero nights there", () => {
  expect(budgetOrigin()).toBe("Home base: Ho Chi Minh City");
  expect(budgetOrigin("invalid")).toBe("Home base: Ho Chi Minh City");
  const event = {
    ...find("hobby-horizon"), date_status: "confirmed" as const,
    start_date: "2027-01-09", end_date: "2027-01-10",
  };
  const defaults = { lodging: money(600000), meals: money(150000) };
  const fromHome = calculateTripBudget(event, now, today, undefined, undefined, {}, defaults);
  const fromBangkok = calculateTripBudget(event, now, today, "th-bangkok", undefined, {}, defaults);
  expect(fromHome.suggestedNights).toBe(0);
  expect(fromBangkok.suggestedNights).toBe(fromBangkok.days);
  expect(fromHome.extraCosts.find(({ category }) => category === "lodging")?.cost?.amount).toBe(0);
  const home = load(renderToStaticMarkup(<TripBudget event={event} now={now} today={today} defaults={defaults} />));
  const lodging = home(".trip-budget-costs dt").filter((_, row) => home(row).text() === "Lodging").next();
  expect(lodging.find("span").first().text()).toBe("VND 0");
  expect(lodging.find("small").text()).toContain("0 lodging nights because the show is in your home city");
  expect(home(".trip-budget-costs").text()).toContain("2 meal days assumed from 2 selling days");
  const away = load(renderToStaticMarkup(<TripBudget event={event} now={now} today={today} homeBase="th-bangkok" defaults={defaults} />));
  expect(away(".trip-budget-origin").text()).toBe("Home base: Bangkok");
  expect(away(".trip-budget-costs").text()).toContain("2 lodging nights assumed from 2 selling days");
});

it("flags a saved travel amount after a home-base change and preserves its origin through backup", () => {
  const stored = backup({}, undefined, undefined, undefined, undefined, {
    events: { urban: { costs: { travel: money(200, "USD") }, travelHomeBase: "vn-ho-chi-minh-city" } },
  });
  const { tripBudget } = loadEntries({ getItem: () => JSON.stringify(stored) });
  const local = tripBudget.events.urban;
  const markup = (homeBase?: string) => load(renderToStaticMarkup(
    <TripBudget event={urban} now={now} today={today} local={local} homeBase={homeBase} />,
  ))(".trip-budget-costs").text();
  expect(markup()).not.toContain("Review this travel amount");
  expect(markup("th-bangkok")).toContain("TravelUSD 200Saved for Ho Chi Minh City. Review this travel amount for Bangkok.");
});

it("saves an imported custom cost named travel separately from the built-in travel amount", () => {
  const stored = backup({}, undefined, undefined, undefined, undefined, {
    events: { urban: { costs: { travel: money(111, "HKD") }, travelHomeBase: "vn-ho-chi-minh-city",
      custom: [{ id: "travel", label: "Custom handling", ...money(222, "USD") }] } },
  });
  const previous = validateBackup(stored).tripBudget!.events.urban;
  const fields = new FormData();
  fields.set("travel-amount", "111");
  fields.set("travel-currency", "HKD");
  fields.set("custom-travel-label", "Custom handling");
  fields.set("custom-travel-amount", "444");
  fields.set("custom-travel-currency", "USD");
  const save = () => readTripBudgetForm(fields, ["travel"], budgetFor(urban, previous).extraCosts, "th-bangkok", previous);
  expect(save()).toMatchObject({
    costs: { travel: money(111, "HKD") },
    travelHomeBase: "vn-ho-chi-minh-city",
    custom: [{ id: "travel", label: "Custom handling", ...money(444, "USD") }],
  });
  fields.set("confirm-travel-base", "on");
  expect(save().travelHomeBase).toBe("th-bangkok");
  fields.set("custom-travel-currency", "UK");
  expect(save).toThrow(/three-letter currency code/);
});

it("leaves extras unset without rates and applies editable assumptions unless a manual line overrides them", () => {
  expect(budgetFor(urban).extraCosts.every(({ cost }) => cost === undefined)).toBe(true);
  const defaults = { lodging: money(120, "USD"), meals: money(75, "USD") };
  const budget = { nights: 3, mealDays: 4, costs: { meals: money(0) } };
  const result = calculateTripBudget(urban, now, today, undefined, undefined, budget, defaults);
  expect(result.extraCosts).toContainEqual({
    category: "lodging", estimate: money(360, "USD"), cost: money(360, "USD"), usesDefault: true,
  });
  expect(result.extraCosts).toContainEqual({
    category: "meals", estimate: money(300, "USD"), cost: money(0), usesDefault: false,
  });
  expect(result.total?.usd).toBeCloseTo(1488 / 7.844282 + 360);
});

const settings = {
  events: {
    urban: { costs: { travel: money(450, "HKD") }, custom: [{ id: "storage", label: "Storage", ...money(250000) }],
      walkAway: money(1600, "HKD"), nights: 3, mealDays: 2 },
    absent: { costs: { travel: money(0) } },
  },
  defaults: { lodging: money(650000), meals: money(150000) },
};

it("round-trips budgets through v1 backup and localStorage without derived or injected amounts", () => {
  const withCache = { ...settings, events: { ...settings.events,
    urban: { ...settings.events.urban, tableFee: money(1), total: money(2),
      costs: { travel: { ...settings.events.urban.costs.travel, usd: 9999, vnd: 1 } } },
  } };
  const raw = JSON.stringify(backup({}, undefined, undefined, undefined, undefined, withCache));
  expect(validateBackup(JSON.parse(raw)).tripBudget).toEqual(settings);
  expect(loadEntries({ getItem: () => raw }).tripBudget).toEqual(settings);
  expect(unknownIds({}, ["urban"], {}, {}, {}, {}, settings.events)).toEqual(["absent"]);
});

it("merges matching budget records, replaces all selected settings, and preserves edits on an older backup", () => {
  const incoming = { events: { urban: { custom: [] } } };
  expect(importTripBudget(settings, incoming, "merge")).toEqual({
    ...settings, events: { ...settings.events, urban: { custom: [] } },
  });
  expect(importTripBudget(settings, incoming, "replace")).toBe(incoming);
  expect(importTripBudget(settings, validateBackup(backup({})).tripBudget, "replace")).toBe(settings);
  expect(importTripBudget(settings, { events: {}, defaults: {} }, "merge").defaults).toEqual({});
});

it("preserves budgets and defaults in the pre-replace backup", () => {
  const setItem = vi.fn();
  vi.stubGlobal("localStorage", { setItem });
  try {
    const key = stashBeforeReplace({}, undefined, undefined, undefined, undefined, settings);
    expect(setItem).toHaveBeenCalledWith(key, expect.any(String));
    expect(validateBackup(JSON.parse(setItem.mock.calls[0][1])).tripBudget).toEqual(settings);
  } finally {
    vi.unstubAllGlobals();
  }
});

it("rejects corrupt imports and recovers other budgets and defaults in local storage", () => {
  const corrupt = { ...settings, events: { ...settings.events, invalid: { costs: { meals: money(-1) } } } };
  const data = backup({}, undefined, undefined, undefined, undefined, corrupt);
  expect(() => validateBackup(data)).toThrow(/Invalid trip budget for invalid/);
  const setItem = vi.fn();
  const result = loadEntries({ getItem: () => JSON.stringify(data), setItem });
  expect(result.tripBudget).toEqual(settings);
  expect(result.dropped).toBe(1);
  expect(result.recoveryKey).toBeTruthy();
  expect(setItem).toHaveBeenCalledWith(result.recoveryKey, JSON.stringify(data));
});

it.each([
  [[{ ...quote, rate_status: "expired" as const }], "All booth rates have expired"],
  [[{ ...quote, eligibility: "ineligible" as const }], "All booth options are ineligible"],
  [[], "No booth price recorded"],
] as const)("uses the existing money reason when no fee is applicable", (options, message) => {
  const event = { ...urban, vendor_cost: null, vendor_options: [...options] };
  const $ = load(renderToStaticMarkup(<TripBudget event={event} now={now} today={today} />));
  expect($(".trip-budget-costs").text()).toContain(message);
  expect(budgetFor(event).total).toBeNull();
});

it("shows the original booth rate, VND first for totals, gross sales wording, and the quote flag", () => {
  const event = { ...urban, vendor_options: [quote], vendor_cost: "SGD 100" };
  const $ = load(renderToStaticMarkup(<TripBudget event={event} now={now} today={today} onSave={vi.fn()} />));
  const text = $(".trip-budget-costs").text();
  expect(text).toContain("SGD 280 · USD 216.91 · VND 5,581,090");
  expect(text).toContain("Above walk-away:");
  expect($(".trip-budget-costs dd").filter((_, row) => $(row).text() === "Not entered")).toHaveLength(6);
  expect($(".trip-budget-totals").text()).toContain("Trip total for entered costs");
  expect($(".trip-budget-totals strong").first().text()).toMatch(/^VND .* · USD /);
  expect($(".trip-budget-totals").text()).toContain("gross sales to cover trip costs, before cost of goods.");
  expect($('button[aria-haspopup="dialog"]').text()).toBe("Edit trip budget");
});

it("uses a device budget over the shared record and exposes reset to shared", () => {
  const event = { ...urban, trip_budget: { costs: { travel: money(400) } } };
  const local = { costs: { travel: money(200) } };
  const markup = (localBudget?: Budget) => load(renderToStaticMarkup(
    <TripBudget event={event} now={now} today={today} local={localBudget} onSave={vi.fn()} />,
  ));
  const shared = markup();
  const device = markup(local);
  expect(shared(".trip-budget-costs").text()).toContain("TravelVND 400");
  expect(device(".trip-budget-costs").text()).toContain("TravelVND 200");
  expect(device("button").text()).toContain("Reset budget to shared");
});
