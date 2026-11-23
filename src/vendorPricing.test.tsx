import { readFileSync } from "node:fs";
import { load } from "cheerio";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import raw from "../data/events.json";
import { EventCard } from "./components/EventCard";
import { EventRows } from "./components/EventRows";
import { VendorMoney } from "./components/VendorMoney";
import { VendorPriceCue } from "./components/VendorPriceCue";
import { mergeVendorPricing, normalizeEvents } from "./data";
import { scoreEvent } from "./scoring";
import { backup, emptyEntry, importVendorPricing, loadEntries, removeVendorPricingEdit, unknownIds, validateBackup } from "./storage";
import { applicableVendorPrice, legacyVendorPrice, missingPriceMessage, optionRateStatus, parseBoothCost } from "./vendorPricing";

const events = normalizeEvents(raw);
const event = (id: string) => events.find((row) => row.id === id)!;
const now = Date.parse("2026-11-21T12:00+07:00");
const zub = event("zubculture");
const regular = zub.vendor_options![0];

it("chooses the cheapest current eligible quote before published options and listed costs", () => {
  const cheapPublished = { ...regular, id: "cheap-published", basis: "published" as const, amount: 100, usd_amount: 77.47 };
  const listed = { ...zub, vendor_cost: "SGD 75 per booth" };
  expect(applicableVendorPrice({ ...listed, vendor_options: [cheapPublished, ...[...zub.vendor_options!].reverse()] }, now))
    .toMatchObject({ basis: "quote", option: { id: "regular" }, usd: 216.91 });
  expect(applicableVendorPrice({ ...listed, vendor_options: [cheapPublished] }, now))
    .toMatchObject({ basis: "published", option: { id: "cheap-published" } });
  expect(applicableVendorPrice({ ...listed, vendor_options: [] }, now))
    .toMatchObject({ basis: "listed", amount: 75 });
});

it("skips past-year, expired, unavailable, ineligible, unclear and add-on options", () => {
  const flags = [
    { rate_status: "past_year" }, { rate_status: "expired", early_bird: true },
    { valid_until: "2026-11-21T12:00:00+07:00", early_bird: true }, { rate_status: "unavailable" },
    { eligibility: "ineligible" }, { eligibility: "unclear" }, { kind: "add_on" },
  ] as const;
  const vendor_options = flags.map((flag, i) => ({ ...regular, ...flag, id: "excluded-" + i }));
  expect(applicableVendorPrice({ ...zub, vendor_options }, now)).toBeNull();
  expect(applicableVendorPrice({ ...zub, vendor_options, vendor_cost: "SGD 280 per booth" }, now)).toBeNull();
  expect(applicableVendorPrice({ ...zub, vendor_options, vendor_cost: "SGD 400 per booth" }, now))
    .toMatchObject({ basis: "listed", amount: 400 });
});

it("leaves prior-edition and expired legacy rates outside the applicable price", () => {
  const dubai = event("def-gameexpo");
  expect(legacyVendorPrice(dubai)).toMatchObject({ status: "past_year", quoteYear: 2026 });
  expect(applicableVendorPrice(dubai, now)).toBeNull();
  expect(applicableVendorPrice({ ...dubai, vendor_cost: "Expired early-bird rate: AED 500" }, now)).toBeNull();
  expect(applicableVendorPrice({ ...dubai, vendor_cost: "AED 500 (2028)" }, now)).toBeNull();
});

it("keeps a multi-weekend bundle as reference pricing outside the single-event estimate", () => {
  const event = { ...zub, vendor_options: [],
    vendor_cost: "Jan + Apr bundle: S$330 standard table, S$600 L-shaped table (both events combined; organizer Instagram, 12 Nov 2026)" };
  expect(applicableVendorPrice(event, now)).toBeNull();
  expect(missingPriceMessage(event, now)).toBe("Only a multi-event bundle price is listed.");
  const $ = load(renderToStaticMarkup(<VendorPriceCue event={event} now={now} />));
  expect($(".vendor-price-cue").length).toBe(0);
});

it("keeps TCG Con Arabia's shipped December 2026 price out of 2027 commercial scoring", () => {
  const arabia = event("tcg-con-arabia");
  expect(legacyVendorPrice(arabia)).toMatchObject({ amount: 3500, currency: "SAR", status: "past_year" });
  expect(applicableVendorPrice(arabia, now)).toBeNull();
  const commercial = scoreEvent(arabia, { now }).factors.find((factor) => factor.key === "commercial");
  expect(commercial?.basis).toBe("estimated");
  expect(commercial?.signals).toContain("Prior-edition rate on file");
  expect(commercial?.signals?.some((signal) => signal.includes("per 1,000"))).toBe(false);
});

it("uses the November research rates for listed prices and labels their USD estimates", () => {
  for (const [currency, rate] of [
    ["SGD", 1.290845], ["AED", 3.6725], ["VND", 25729.721904],
    ["THB", 33.94469], ["HKD", 7.844282], ["AUD", 1.498714],
  ] as const) {
    expect(parseBoothCost(`${currency} 100`)?.approxUsd).toBeCloseTo(100 / rate, 10);
  }
  const bangkok = event("cq-bkk");
  expect(applicableVendorPrice(bangkok, now)).toMatchObject({ basis: "listed", amount: 4800, currency: "THB" });
  const $ = load(renderToStaticMarkup(<VendorPriceCue event={bangkok} now={now} />));
  expect($(".vendor-price-cue").text()).toBe("Booth est. · USD 141.41");
});

it.each([
  ["zubculture", "regular", "SGD", 280, 1.290845, 216.91],
  ["mefcc-2027", "shell-4", "AED", 7686, 3.6725, 2092.85],
  ["color18", "commercial-9", "VND", 15000000, 25729.721904, 582.98],
  ["urban", "area-2", "HKD", 1488, 7.844282, 189.69],
] as const)("uses the dated research FX for %s", (id, optionId, currency, amount, rate, usd) => {
  expect(applicableVendorPrice(event(id), now)).toMatchObject({
    amount, usd, currency,
    option: { id: optionId, fx_rate: rate, fx_as_of: "2026-11-20", fx_source: "https://open.er-api.com/v6/latest/USD" },
  });
  expect(Number((amount / rate).toFixed(2))).toBe(usd);
});

it("uses MEFCC's payable amount in commercial ROI, including listing and VAT", () => {
  const mefcc = event("mefcc-2027");
  expect(mefcc.vendor_options![0]).toMatchObject({ amount: 7320, amount_incl_vat: 7686, vat_rate: 0.05 });
  const commercial = scoreEvent({ ...mefcc, visitors: 1000, vendor_cost: "AED 500" }, { now })
    .factors.find((factor) => factor.key === "commercial");
  expect(commercial?.signals).toContain("Approx. USD 2092.85 per 1,000 reported attendees / places");
});

it("keeps ACE standard pricing unclear and labels both early-bird packages expired", () => {
  const ace = event("scan-suntec-asia-comic-expo-005-202701");
  expect(ace.vendor_options?.map((option) => [option.amount, option.eligibility, optionRateStatus(option, now)]))
    .toEqual([[350, "unclear", "current"], [320, "unclear", "expired"], [330, "unclear", "expired"]]);
  expect(applicableVendorPrice(ace, now)).toBeNull();
});

it.each([
  ["gold-coast-202704", "2026-11-23", 1606, 1071.59, 2414],
  ["melbourne-202704", "2026-11-23", 1606, 1071.59, 2414],
  ["sydney-202706", "2027-02-08", 1745, 1164.33, 2622],
  ["perth-202706", "2027-02-08", 1606, 1071.59, 2414],
  ["adelaide-202710", "2027-07-09", 1433, 956.15, 2149],
  ["brisbane-202711", "2027-07-09", 1745, 1164.33, 2622],
] as const)("switches Supanova %s from early-bird shell to standard shell at the cutoff", (city, date, early, usd, full) => {
  const nova = event("scan-supanova-supanova-comic-con-gaming-" + city);
  const cutoff = Date.parse(date + "T00:00+10:00");
  expect(nova.vendor_options?.filter((option) => option.id.startsWith("market-")))
    .toMatchObject([{ eligibility: "unclear" }, { eligibility: "unclear" }]);
  expect(applicableVendorPrice(nova, cutoff - 1)).toMatchObject({ amount: early, usd, option: { id: "shell-early" } });
  expect(applicableVendorPrice(nova, cutoff)).toMatchObject({ amount: full, option: { id: "shell-full" } });
});

it("ships Japan Expo's proposal excerpt and source with an empty rate list", () => {
  const japan = event("jet-2027");
  expect(japan.vendor_options).toEqual([]);
  expect(applicableVendorPrice(japan, now)).toBeNull();
  expect(japan.vendor_documents).toMatchObject([{
    path: "vendor-docs/japan-expo-thailand-2027-proposal-excerpt.pdf",
    source: "https://drive.google.com/file/d/1oEur5IwMEvYggiV5lHWpbMK13eTPgtaT/view",
    received_at: "2026-11-19",
  }]);
  const file = readFileSync(new URL("../public/" + japan.vendor_documents![0].path, import.meta.url));
  expect(file.subarray(0, 4).toString()).toBe("%PDF");
  expect(file.length).toBeLessThan(2_000_000);
});

it("loads option and document edits from a backup and merges them by event and item ID", () => {
  const color = event("color18"), doc = color.vendor_documents![0], option = color.vendor_options![0];
  const pricing = { color18: { vendor_options: [{ ...option, notes: "Local note" }], vendor_documents: [{ ...doc, label: "Local label" }] } };
  const exported = JSON.stringify(backup({}, undefined, undefined, undefined, pricing));
  const loaded = loadEntries({ getItem: () => exported });
  expect(loaded.error).toBe("");
  expect(loaded.vendorPricing).toEqual(pricing);
  const incoming = { color18: { vendor_options: [{ ...option, rate_status: "unavailable" as const }] } };
  const merged = importVendorPricing(loaded.vendorPricing, incoming, "merge");
  expect(merged.color18).toEqual({ ...pricing.color18, ...incoming.color18 });
  expect(importVendorPricing(merged, incoming, "replace")).toBe(incoming);
  expect(importVendorPricing(merged, validateBackup(backup({})).vendorPricing, "replace")).toBe(merged);
  expect(unknownIds({}, [], {}, {}, {}, merged)).toEqual(["color18"]);
  const reset = removeVendorPricingEdit(merged, color.id, "vendor_options", option.id);
  expect(mergeVendorPricing(color, reset.color18)).toEqual({
    vendor_options: [option], vendor_documents: pricing.color18.vendor_documents,
  });
});

it.each(["color18", "mefcc-2027"])("recalculates mismatched USD in imports and saved local data for %s", (id) => {
  const original = event(id).vendor_options![0];
  const edits = { [id]: { vendor_options: [{ ...original, usd_amount: 1 }] } };
  const value = backup({}, undefined, undefined, undefined, edits);
  const expected = { [id]: { vendor_options: [original] } };
  expect(validateBackup(value).vendorPricing).toEqual(expected);
  expect(loadEntries({ getItem: () => JSON.stringify(value) }).vendorPricing).toEqual(expected);
});

it("rejects unsafe document paths in backup imports and recovers valid records from local storage", () => {
  const doc = event("jet-2027").vendor_documents![0];
  const pricing = { "jet-2027": { vendor_documents: [doc, { ...doc, id: "invalid", path: "vendor-docs/../other.pdf" }] } };
  const value = backup({}, undefined, undefined, undefined, pricing);
  expect(() => validateBackup(value)).toThrow("under vendor-docs/");
  const loaded = loadEntries({ getItem: () => JSON.stringify(value) });
  expect(loaded.vendorPricing["jet-2027"].vendor_documents).toEqual([doc]);
  expect(loaded.dropped).toBe(1);
  expect(loaded.error).toContain("Automatic saving is paused");
});

it("renders the tax-inclusive quote, labeled table cells and public floorplan in Money", () => {
  const mefcc = event("mefcc-2027");
  const $ = load(renderToStaticMarkup(<VendorMoney event={mefcc} now={now} />));
  expect($(".money-summary").text()).toContain("AED 7,686 · USD 2,092.85");
  const row = $('tr[data-applicable="true"]');
  expect(row).toHaveLength(1);
  expect(row.text()).toContain("AED 7,320");
  expect(row.text()).toContain("AED 920 listing fee. VAT is 5%.");
  expect(row.find(".money-cell-label").map((_, el) => $(el).text()).get())
    .toEqual(["Size", "Includes", "Original price", "USD", "TCG singles", "Notes"]);
  expect($(".money-file").attr("href")).toBe("/vendor-docs/mefcc-2027-floorplan.pdf");
  expect($(".money-document-meta time").text()).toBe("Received 19 Nov 2026");
});

it("shows Japan Expo as quote pending and labels expired and unclear ACE rates", () => {
  const japan = load(renderToStaticMarkup(<VendorMoney event={event("jet-2027")} now={now} />));
  expect(japan(".money-summary").text()).toBe("Quote pending");
  expect(japan(".money-table")).toHaveLength(0);
  expect(japan(".money-file").attr("href")).toBe("/vendor-docs/japan-expo-thailand-2027-proposal-excerpt.pdf");
  const ace = load(renderToStaticMarkup(<VendorMoney event={event("scan-suntec-asia-comic-expo-005-202701")} now={now} />));
  expect(ace(".money-summary").text()).toContain("TCG singles eligibility unclear");
  expect(ace(".money-tag").filter((_, item) => ace(item).text() === "Expired early bird")).toHaveLength(2);
  expect(ace('tr[data-inactive="true"]')).toHaveLength(2);
  expect(ace('tr[data-applicable="true"]')).toHaveLength(0);
});

it("explains missing booth prices and labels eligible add-ons", () => {
  const summary = (event: Parameters<typeof VendorMoney>[0]["event"]) =>
    load(renderToStaticMarkup(<VendorMoney event={event} now={now} />))(".money-summary").text();
  expect(summary({ ...zub, event_status: "cancelled" })).toBe("Event cancelled.");
  expect(summary({ ...zub, vendor_options: [{ ...regular, rate_status: "expired" }] })).toBe("All booth rates have expired.");
  expect(summary({ ...zub, vendor_options: [{ ...regular, eligibility: "ineligible" }] })).toContain("ineligible for TCG singles");
  expect(summary({ ...zub, vendor_options: [
    { ...regular, rate_status: "expired" },
    { ...regular, id: "ineligible", eligibility: "ineligible" },
  ] })).toContain("expired rates and ineligible options");
  expect(summary({ ...zub, vendor_options: [], vendor_cost: null })).toBe("No booth price recorded.");
  expect(summary(event("tcg-con-arabia"))).toBe("Only prior-edition booth rates are on file.");
  const $ = load(renderToStaticMarkup(<VendorMoney event={event("urban")} now={now} />));
  expect($("tbody tr").last().find("td").eq(4).text()).toBe("TCG singlesAdd-on");
  expect($('tr[data-applicable="true"] .money-tag').text()).toBe("Applicable");
});

it("renders the same applicable price cue in Grid and Rows", () => {
  const score = scoreEvent(zub, { now });
  const shared = { entries: {}, today: "2026-11-21", now, setGoing: vi.fn(), setStage: vi.fn(), open: vi.fn() };
  const grid = load(renderToStaticMarkup(<EventCard e={zub} entry={emptyEntry} score={score} {...shared} />));
  const rows = load(renderToStaticMarkup(<EventRows groups={new Map([["", [zub]]])} columns={[]}
    sort={{ key: "dates", direction: "asc" }} setSort={vi.fn()} scores={{ [zub.id]: score }} selectMode={false} {...shared} />));
  expect(grid(".vendor-price-cue").text()).toBe("Booth quote · USD 216.91");
  expect(rows(".vendor-price-cue").text()).toBe(grid(".vendor-price-cue").text());
});
