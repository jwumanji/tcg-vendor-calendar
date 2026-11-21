import { describe, expect, it } from "vitest";
import raw from "../data/events.json";
import { mergeMilestones, normalizeEvents, normalizeMilestone, normalizeMilestones } from "./data";
import { milestoneCountdown, milestonePassed, milestoneTimes, upcomingMilestones } from "./milestones";
import { ics, milestoneIcs } from "./utils";
import { backup, importMilestoneEdits, loadEntries, removeMilestoneEdit, unknownIds, validateBackup } from "./storage";

const events = normalizeEvents(raw);
const cardCon = events.find((event) => event.id === "cardcon3")!;
const bangkok = events.find((event) => event.id === "bkk-card-show")!;
const urban = events.find((event) => event.id === "urban")!;
const singapore = cardCon.vendor_milestones![0];
const reservations = bangkok.vendor_milestones![0];
const applyBy = urban.vendor_milestones![0];
const now = Date.parse("2026-11-21T00:00:00Z");
const unfold = (text: string) => text.replace(/\r\n /g, "");

describe("booking milestones", () => {
  it("keeps original deadline prose without treating player or uncertain text as a booking date", () => {
    const showdown = events.find((event) => event.id === "poke-showdown-my")!;
    expect(showdown.vendor_deadline).toContain("Player lottery registration");
    expect(showdown.vendor_milestones).toBeUndefined();
    expect(cardCon.vendor_deadline).toMatch(/General booking opens 30 Nov 2026 at 23:00 Saigon time.*first come, first served/);
    expect(bangkok.vendor_deadline).toContain("1 Dec 2026 at 12:00 Bangkok / Saigon time");
    const shows = unfold(ics([cardCon, bangkok]));
    expect(shows).toContain("30 Nov 2026 at 23:00 Saigon time");
    expect(shows).toContain("1 Dec 2026 at 12:00 Bangkok / Saigon time");
    expect(shows).not.toMatch(/Card Con 2 exhibitors first|Not published/);
    expect(upcomingMilestones(events, now).map(({ event }) => event.id))
      .toEqual(["cardcon3", "bkk-card-show", "urban"]);
  });

  it("normalizes optional fields and keeps date-only dates and explicit offsets", () => {
    expect(normalizeMilestone({
      ...reservations, label: "  Reservations  ", notes: " ", extra: true,
      at: " 2026-12-01T12:00+07:00 ",
    })).toEqual({ ...reservations, label: "Reservations", at: "2026-12-01T12:00+07:00" });
    expect(normalizeMilestone({ ...applyBy, at: "2026-12-20" }).at).toBe("2026-12-20");
    expect(normalizeMilestone({ ...reservations, at: "2026-12-01T05:00:00.000Z" }).at)
      .toBe("2026-12-01T05:00:00.000Z");
  });

  it.each([
    { at: "2026-02-30T12:00+08:00" },
    { at: "2026-12-01T12:00" },
    { at: "2026-12-01T24:00:00Z" },
    { at: "Dec 1 at noon" },
    { timeZone: "Asia/Unknown" },
    { timeZone: "+07:00" },
    { type: "anything" },
    { verified: "true" },
  ])("rejects invalid milestone fields %j", (invalid) => {
    expect(() => normalizeMilestone({ ...reservations, ...invalid })).toThrow();
  });

  it("ignores invalid or duplicate records when loading shared data and rejects them in a backup", () => {
    const records = [reservations, { ...reservations, label: "Duplicate" }, { id: "bad" }, applyBy];
    expect(normalizeMilestones(records)).toEqual([reservations, applyBy]);
    expect(() => validateBackup(backup({}, undefined, undefined, { event: records as typeof reservations[] })))
      .toThrow(/Duplicate booking milestone ID/);
  });

  it("formats and exports a valid three-digit year with a four-digit calendar timestamp", () => {
    const old = normalizeMilestone({ ...singapore, at: "0999-01-01T12:00:00Z", timeZone: "UTC" });
    expect(milestoneTimes(old)).toEqual(["1 Jan 999, 19:06 Saigon", "1 Jan 999, 12:00 UTC"]);
    expect(milestoneIcs(cardCon, old)).toContain("DTSTART:09990101T120000Z");
    const historic = normalizeMilestone({ ...old, at: "0999-01-01" });
    expect(milestoneTimes(historic)).toEqual(["1 Jan 999 · UTC date"]);
  });

  it.each([
    { at: "9999-12-31T23:30:00-01:00", timeZone: "UTC" },
    { at: "9999-12-31T20:00:00Z", timeZone: "UTC" },
    { at: "9999-12-31T16:00:00Z", timeZone: "Asia/Singapore" },
    { at: "0001-01-01T00:00:00+01:00", timeZone: "UTC" },
    { at: "0000-12-31", timeZone: "UTC" },
  ])("rejects an out-of-range date in validation, import and recovery %j", (fields) => {
    const invalid = { ...reservations, ...fields };
    expect(() => normalizeMilestone(invalid)).toThrow(/years 0001–9999/);
    const saved = backup({}, undefined, undefined, { [cardCon.id]: [singapore, invalid] });
    expect(() => validateBackup(saved)).toThrow(/years 0001–9999/);
    const raw = JSON.stringify(saved);
    const recovered = loadEntries({ getItem: () => raw });
    expect(recovered.milestones).toEqual({ [cardCon.id]: [singapore] });
    expect(recovered.dropped).toBe(1);
    expect(recovered.raw).toBe(raw);
  });

  it("shows Singapore midnight and the previous night in Saigon for Card Con 3", () => {
    expect(milestoneTimes(singapore)).toEqual([
      "30 Nov 2026, 23:00 Saigon",
      "1 Dec 2026, 00:00 Singapore",
    ]);
    expect(singapore.notes).toMatch(/First come, first served.*priority window has closed/);
  });

  it("seeds the researched Bangkok table opening with one clock shared by Bangkok and Saigon", () => {
    expect(reservations).toMatchObject({
      type: "booking_opens", verified: true, timeZone: "Asia/Bangkok",
      source: "https://bangkokcardshow.com/Tablereservations",
    });
    expect(Date.parse(reservations.at)).toBe(Date.parse("2026-12-01T05:00:00Z"));
    expect(milestoneTimes(reservations)).toEqual(["1 Dec 2026, 12:00 Bangkok / Saigon"]);
  });

  it("orders timed milestones by instant and skips expired, unverified and cancelled ones", () => {
    const earlier = { ...singapore, id: "earlier", at: "2026-11-30T18:00:00+03:00" };
    const later = { ...singapore, id: "later", at: "2026-12-01T12:00:00Z" };
    const missed = { ...singapore, id: "missed", at: "2026-11-20T12:00:00Z" };
    const unverified = { ...later, id: "unverified", verified: false };
    const actual = upcomingMilestones([
      { ...urban, event_status: "cancelled" },
      bangkok,
      { ...cardCon, vendor_milestones: [later, unverified, singapore, missed, earlier] },
    ], now);
    expect(actual.map(({ milestone }) => milestone.id)).toEqual([
      "earlier", singapore.id, reservations.id, "later",
    ]);
    expect(upcomingMilestones([bangkok, cardCon], Date.parse("2026-11-30T16:00:01Z"))
      .map(({ event }) => event.id)).toEqual([bangkok.id]);
  });

  it("keeps date-only apply-by dates through the organizer's calendar day", () => {
    expect(milestoneTimes(applyBy)).toEqual(["20 Dec 2026 · Hong Kong date"]);
    expect(milestonePassed(applyBy, Date.parse("2026-12-20T15:59:59Z"))).toBe(false);
    expect(milestonePassed(applyBy, Date.parse("2026-12-20T16:00:00Z"))).toBe(true);
  });

  it("counts calendar days in Saigon for exact times and in the organizer's zone for date-only milestones", () => {
    expect(milestoneCountdown(cardCon, singapore, now)).toBe("in 9 days");
    expect(milestoneCountdown(cardCon, singapore, Date.parse("2026-11-29T17:00:00Z"))).toBe("today");
    expect(milestoneCountdown(cardCon, singapore, Date.parse("2026-11-30T16:00:01Z"))).toBeUndefined();
    expect(milestoneCountdown(urban, applyBy, Date.parse("2026-12-19T15:59:59Z"))).toBe("in 1 day");
    expect(milestoneCountdown(urban, applyBy, Date.parse("2026-12-19T16:00:00Z"))).toBe("by end of day");
    expect(milestoneCountdown(urban, { ...applyBy, verified: false }, now)).toBeUndefined();
    expect(milestoneCountdown({ ...urban, event_status: "postponed" }, applyBy, now)).toBeUndefined();
  });
});

describe("booking calendar exports", () => {
  it("exports the exact instant with a stable UID distinct from the event UID", () => {
    const exportText = unfold(milestoneIcs(cardCon, singapore));
    const uid = "UID:cardcon3:general-booking@milestones.tcg-vendor-calendar";
    expect(exportText).toContain(uid + "\r\n");
    expect(exportText).toContain("DTSTART:20261130T160000Z\r\n");
    expect(exportText).toContain("30 Nov 2026\\, 23:00 Saigon");
    expect(exportText).toContain("priority window has closed.");
    expect(milestoneIcs(bangkok, reservations)).toContain("DTSTART:20261201T050000Z\r\n");
    expect(unfold(milestoneIcs(cardCon, { ...singapore, at: "2026-12-04T12:00+08:00" }))).toContain(uid);
    const event = { ...cardCon, original_start_date: cardCon.start_date!, start_date: "2027-04-04" };
    expect(unfold(ics([event]))).toContain("UID:cardcon3-2027-04-03@tcg-vendor-calendar\r\n");
  });

  it("exports a date-only milestone without a clock time and restricts exports to verified active milestones", () => {
    expect(milestoneIcs(urban, applyBy)).toContain("DTSTART;VALUE=DATE:20261220\r\n");
    expect(() => milestoneIcs(urban, { ...applyBy, verified: false })).toThrow(/Verify this date/);
    expect(() => milestoneIcs({ ...urban, event_status: "cancelled" }, applyBy)).toThrow(/cancelled/);
  });
});

describe("booking edits and backups", () => {
  const correction = { ...singapore, at: "2026-12-02T00:00:00+08:00" };
  const added = { ...singapore, id: "add-on-booking" };
  const edits = { cardcon3: [correction, added], "temporarily-absent": [reservations] };

  it("loads corrections and additions and overlays them on refreshed shared data by stable ID", () => {
    const outreach = { cardcon3: { notes: "Follow up Monday" } };
    const value = JSON.stringify(backup({}, undefined, outreach, edits));
    const loaded = loadEntries({ getItem: () => value });
    expect(loaded.error).toBe("");
    expect(loaded.outreach).toEqual(outreach);
    expect(loaded.milestones).toEqual(edits);
    expect(unknownIds({}, [cardCon.id], {}, loaded.outreach, loaded.milestones)).toEqual(["temporarily-absent"]);
    const refreshed = [singapore, { ...singapore, id: "payment-date", type: "payment_due" as const }];
    expect(mergeMilestones(refreshed, loaded.milestones.cardcon3)).toEqual([correction, refreshed[1], added]);
  });

  it("merges edits by milestone ID, supports replace and keeps edits when an older backup omits the field", () => {
    const legacy = validateBackup(backup({}));
    const incoming = validateBackup(backup({}, undefined, undefined, { cardcon3: [singapore] }));
    expect(importMilestoneEdits(edits, incoming.milestones, "merge"))
      .toEqual({ ...edits, cardcon3: [singapore, added] });
    expect(importMilestoneEdits(edits, incoming.milestones, "replace")).toEqual(incoming.milestones);
    expect(importMilestoneEdits(edits, legacy.milestones, "replace")).toEqual(edits);
  });

  it("resets only the selected shared milestone and deletes a local addition across reloads", () => {
    const reset = removeMilestoneEdit(edits, cardCon.id, correction.id);
    const refreshed = { ...singapore, at: "2026-12-03T00:00:00+08:00" };
    expect(mergeMilestones([refreshed], reset[cardCon.id])).toEqual([refreshed, added]);
    const afterDelete = removeMilestoneEdit(reset, cardCon.id, added.id);
    const value = JSON.stringify(backup({}, undefined, undefined, afterDelete));
    expect(loadEntries({ getItem: () => value }).milestones).toEqual({ "temporarily-absent": [reservations] });
    expect(edits.cardcon3).toEqual([correction, added]);
  });

  it("recovers valid sibling milestones and preserves the raw stored backup if one is corrupt", () => {
    const value = JSON.stringify({
      ...backup({}, undefined, undefined, edits),
      milestones: { cardcon3: [correction, { ...added, at: "October" }] },
    });
    const result = loadEntries({ getItem: () => value });
    expect(result.milestones).toEqual({ cardcon3: [correction] });
    expect(result.dropped).toBe(1);
    expect(result.raw).toBe(value);
  });
});
