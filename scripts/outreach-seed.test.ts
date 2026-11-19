import { describe, expect, it } from "vitest";
import { mergeOutreach, normalizeEvents } from "../src/data.ts";
import { seedOutreach } from "./outreach-seed.ts";

const route = "https://example.com/vendor-form";
const research = [
  {
    id: "form", contact_type: "form", contact: route, published_booth_price: "$100",
    price_source_url: "https://example.com/prices", notes: "One table and two badges",
  },
  { id: "email", contact_type: "email", contact: "sales@example.com", published_booth_price: "" },
  { id: "no-route", contact_type: "none", contact: "", published_booth_price: "" },
];
const emailLog = [
  { id: "email", status: "contacted", method: "email", contacted_at: "2026-11-19", message_ref: "abc123" },
];
const events = normalizeEvents([
  { id: "form", name: "Form event", vendor_cost: "$90", contact: "Original contact field" },
  { id: "email", name: "Email event" },
  { id: "no-route", name: "Event without a route" },
  {
    id: "other", name: "Unrelated event",
    outreach: mergeOutreach(null, { status: "quoted", quoted_price: "$950", notes: "Previously logged" }),
  },
]);

describe("outreach seed", () => {
  it("is idempotent, preserves event fields and adds research to every matched ID", () => {
    const result = seedOutreach(events, research, emailLog);
    expect(seedOutreach(result, research, emailLog)).toEqual(result);
    expect(result[0]).toMatchObject({
      vendor_cost: "$90", contact: "Original contact field",
      outreach: {
        status: "not_contacted", method: null, contact: route, contact_type: "form",
        published_booth_price: "$100", price_source_url: "https://example.com/prices",
        research_notes: "One table and two badges",
      },
    });
    expect(result[1].outreach).toMatchObject({
      status: "contacted", method: "email", contacted_at: "2026-11-19",
      message_ref: "abc123", contact: "sales@example.com",
    });
    expect(result[2].outreach).toMatchObject({ status: "not_contacted", method: null, contact_type: "none", contact: null });
    expect(result[3]).toBe(events[3]);
  });

  it("applies appended form and quote results without losing the route, research or other events", () => {
    const original = seedOutreach(events, research, emailLog);
    const formUpdates = [
      { id: "form", status: "contacted", method: "form", contacted_at: "2026-11-20", message_ref: "form-result" },
      { id: "form", status: "quoted", response_at: "2026-11-21", quoted_price: "$85", notes: "End table available" },
    ];
    const result = seedOutreach(original, research, [...emailLog, ...formUpdates]);
    expect(result.slice(1)).toEqual(original.slice(1));
    expect(result[0].outreach).toMatchObject({
      status: "quoted", method: "form", contact: route, contact_type: "form",
      contacted_at: "2026-11-20", message_ref: "form-result", response_at: "2026-11-21",
      published_booth_price: "$100", quoted_price: "$85", notes: "End table available",
    });
    expect(seedOutreach(result, research, [...emailLog, ...formUpdates])).toEqual(result);
  });

  it("applies corrected research to an event awaiting outreach", () => {
    const original = seedOutreach(events, research, emailLog);
    const correctedResearch = [
      { ...research[0], contact_type: "email", contact: "vendor@example.com", published_booth_price: "$120", notes: "Email pending" },
      ...research.slice(1),
    ];
    const result = seedOutreach(original, correctedResearch, emailLog);
    expect(result[0].outreach).toMatchObject({
      status: "not_contacted", method: null, contacted_at: null,
      contact_type: "email", contact: "vendor@example.com",
      published_booth_price: "$120", research_notes: "Email pending",
    });
    expect(result.slice(1)).toEqual(original.slice(1));
  });

  it("rejects unknown IDs in research and in the log", () => {
    expect(() => seedOutreach(events, [...research, { id: "unknown" }], emailLog)).toThrow("Unknown event ID unknown");
    expect(() => seedOutreach(events, research, [...emailLog, { id: "unknown" }])).toThrow("Unknown event ID unknown");
  });
});
