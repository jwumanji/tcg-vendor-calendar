import { describe, expect, it } from "vitest";
import shipped from "../data/events.json";
import log from "../data/outreach-log.json";
import contacts from "../data/outreach-contacts.json";
import type { Event } from "../src/model.ts";
import { mergeOutreach, normalizeEvents } from "../src/data.ts";
import { dueOutreach } from "../src/outreach.ts";
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
  it("recreates the shipped outreach from the actual log and produces identical output on a rerun", () => {
    const published = shipped as Event[];
    const withoutOutreach = published.map(({ outreach: _outreach, ...event }) => event);
    const seeded = seedOutreach(withoutOutreach, contacts.events, log);
    expect(seeded).toEqual(published);
    expect(JSON.stringify(seedOutreach(seeded, contacts.events, log))).toBe(JSON.stringify(seeded));
    expect(Object.fromEntries(seeded.filter(({ id }) => ["zubculture", "mefcc-2027", "color18", "jet-2027"].includes(id))
      .map(({ id, outreach }) => [id, [outreach?.status, outreach?.response_at, outreach?.message_ref]]))).toEqual({
      zubculture: ["replied", "2026-11-21", "1a1fbc207bf5a3d7"],
      "mefcc-2027": ["quoted", "2026-11-19", "1a1f36f00771f806"],
      color18: ["replied", "2026-11-20", "1a1f71da66fca555"],
      "jet-2027": ["replied", "2026-11-19", "1a1f365362759e5c"],
    });
  });

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

  it("closes Japan Expo's earlier reply task when a quote arrives and preserves HKTDC's acknowledgement", () => {
    const priorLog = log.map((row) => row.id === "jet-2027" && row.status === "replied"
      ? { ...row, follow_up_due_at: "2026-11-25" } : row);
    const published = shipped as Event[];
    const prior = seedOutreach(published, contacts.events, priorLog);
    expect(prior.find(({ id }) => id === "jet-2027")?.outreach)
      .toMatchObject({ next_action: "reply_to_organizer", follow_up_due_at: "2026-11-25" });
    const amended = [...priorLog,
      { id: "jet-2027", status: "quoted", response_at: "2026-11-26", message_ref: "later-quote", quoted_price: "THB 9,000" },
      { id: "hktdc", status: "replied", response_at: "2026-11-26", message_ref: "human-reply" },
    ];
    const result = seedOutreach(prior, contacts.events, amended);
    const japan = result.find(({ id }) => id === "jet-2027")!;
    expect(japan.outreach).toMatchObject({
      status: "quoted", next_action: null, follow_up_due_at: null, message_ref: "later-quote",
    });
    expect(dueOutreach([japan], "2026-11-26")).toEqual([]);
    expect(result.find(({ id }) => id === "hktdc")?.outreach).toMatchObject({
      status: "replied", acknowledgement_at: "2026-11-20", response_at: "2026-11-26", message_ref: "human-reply",
    });
    expect(JSON.stringify(seedOutreach(result, contacts.events, amended))).toBe(JSON.stringify(result));
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
