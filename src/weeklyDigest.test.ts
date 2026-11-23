import { describe, expect, it, vi } from "vitest";
import { mergeMilestones, mergeOutreach, normalizeEvents } from "./data";
import type { Event, VendorMilestone, VendorOption } from "./model";
import { backup, validateBackup } from "./storage";
import { csv, ics } from "./utils";
import {
  buildDigestSnapshot, digestActions, digestChanges, DIGEST_STORAGE_KEY, loadDigestCheckpoint, saveDigestCheckpoint,
} from "./weeklyDigest";

const snapshotDate = "2026-11-24";
const now = Date.parse("2026-11-24T02:00:00Z");
const event = (id: string, fields: Partial<Event> = {}) =>
  normalizeEvents([{ id, name: id, start_date: "2027-01-09", date_status: "confirmed", ...fields }])[0];
const snapshot = (events: Event[], date = snapshotDate) => buildDigestSnapshot(events, date);
const milestone = (id: string, at: string, fields: Partial<VendorMilestone> = {}): VendorMilestone => ({
  id, at, timeZone: "Asia/Singapore", type: "application_closes", label: id, verified: true,
  source: "https://example.com/vendors", ...fields,
});
function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { data.set(key, value); }),
  };
}
function review(events: Event[]) {
  return saveDigestCheckpoint(snapshot(events), memoryStorage()).checkpoint!;
}

describe("weekly digest checkpoint", () => {
  it("offers a baseline on first visit and writes it only when marked reviewed", () => {
    const storage = memoryStorage();
    const current = snapshot([event("first")]);
    const initial = loadDigestCheckpoint(storage);
    expect(initial).toEqual({ checkpoint: null, error: "" });
    expect(digestChanges(initial.checkpoint, current)).toEqual([]);
    expect(storage.setItem).not.toHaveBeenCalled();

    const saved = saveDigestCheckpoint(current, storage);
    expect(storage.setItem).toHaveBeenCalledExactlyOnceWith(DIGEST_STORAGE_KEY, JSON.stringify(saved.checkpoint));
    expect(Object.keys(JSON.parse(storage.getItem(DIGEST_STORAGE_KEY)!))).toEqual(["reviewedAt", "snapshotDate", "eventsById"]);
    expect(loadDigestCheckpoint(storage)).toEqual(saved);
    expect(digestChanges(saved.checkpoint, current)).toEqual([]);
  });

  it("validates the date, timestamp and nested event records", () => {
    const [record] = normalizeEvents([{ id: "a", name: "A", vendor_milestones: [milestone("booking", "2026-11-29")] }]);
    const stored = review([record]);
    const storage = memoryStorage();
    const malformed = [
      { ...stored, snapshotDate: "2026-02-30" },
      { ...stored, reviewedAt: "2026-01-01" },
      { ...stored, reviewedAt: "2026-02-30T12:00:00.000Z" },
      { ...stored, eventsById: [] },
      { ...stored, eventsById: { a: { ...stored.eventsById.a, dates: [{ start_date: "2026-11-25", end_date: "2026-11-24" }] } } },
      { ...stored, eventsById: { a: { ...stored.eventsById.a, milestones: [{ ...milestone("booking", "2026-11-29"), verified: "yes" }] } } },
      { ...stored, eventsById: { a: { ...stored.eventsById.a, prices: [{ id: "rate", lines: [456] }] } } },
    ];
    for (const value of malformed) {
      storage.setItem(DIGEST_STORAGE_KEY, JSON.stringify(value));
      expect(loadDigestCheckpoint(storage)).toEqual({ checkpoint: null, error: expect.stringContaining("could not be read") });
    }
    storage.setItem(DIGEST_STORAGE_KEY, "{");
    expect(loadDigestCheckpoint(storage).checkpoint).toBeNull();
  });

  it("reports storage errors and leaves the prior checkpoint intact if saving fails", () => {
    const storage = memoryStorage();
    const current = snapshot([event("a")]);
    const saved = saveDigestCheckpoint(current, storage);
    storage.setItem.mockImplementationOnce(() => { throw new Error("Quota exceeded"); });
    expect(saveDigestCheckpoint(snapshot([event("b")]), storage)).toEqual({
      checkpoint: null, error: expect.stringContaining("Could not save"),
    });
    expect(loadDigestCheckpoint(storage)).toEqual(saved);
    storage.getItem.mockImplementationOnce(() => { throw new Error("Unavailable"); });
    expect(loadDigestCheckpoint(storage).error).toContain("Could not read");
  });
});

describe("published changes", () => {
  it("diffs by event ID even if the snapshot date is the same", () => {
    const before = review([event("one", { venue: "Hall A", vendor_cost: "SGD 300" })]);
    const changed = event("one", { start_date: "2027-01-16", venue: "Hall B", vendor_cost: "SGD 350" });
    expect(digestChanges(before, snapshot([changed]))).toEqual([{
      id: "one", name: "one", summary: undefined, fields: [
        { key: "dates", label: "Event dates", previous: ["9 Jan 2027"], current: ["16 Jan 2027"] },
        { key: "venue", label: "Venue", previous: ["Hall A"], current: ["Hall B"] },
        { key: "vendor_cost", label: "Vendor cost", previous: ["SGD 300"], current: ["SGD 350"] },
      ],
    }]);
    expect(digestChanges(before, snapshot([changed], "2026-11-25"))).toHaveLength(1);
  });

  it.each(["11/12/2026 - 13/12/2026", "12/11/2026 – 12/13/2026", "2026-12-11 / 2026-12-13"])(
    "ignores the numeric date note %s when it restates the published dates",
    (date_note) => {
      const first = event("one", { start_date: "2026-12-11", end_date: "2026-12-13", date_note });
      const next = event("one", { start_date: "2026-12-18", end_date: "2026-12-20", date_note: "18/12/2026 - 20/12/2026" });
      const storage = memoryStorage();
      saveDigestCheckpoint(snapshot([first]), storage);
      const { checkpoint } = loadDigestCheckpoint(storage);
      expect(digestChanges(checkpoint, snapshot([next]))[0].fields).toEqual([
        { key: "dates", label: "Event dates", previous: ["11–13 Dec 2026"], current: ["18–20 Dec 2026"] },
      ]);
    },
  );

  it("keeps date notes with extra information or a range that disagrees with the published dates", () => {
    const first = event("one", { start_date: "2026-12-11", end_date: "2026-12-13",
      date_note: "11/12/2026 - 13/12/2026, doors at 10:00" });
    const next = { ...first, date_note: "11/12/2026 - 12/12/2026" };
    expect(digestChanges(review([first]), snapshot([next]))[0].fields).toEqual([
      { key: "date-note", label: "Date note", previous: [first.date_note], current: [next.date_note] },
    ]);
  });

  it("ignores record and nested list order, metadata date bumps and equivalent timed values", () => {
    const first = { start_date: "2027-01-09", end_date: "2027-01-09" };
    const second = { start_date: "2027-02-06", end_date: "2027-02-06" };
    const proof = milestone("booking", "2026-11-30T23:00:00+08:00");
    const draft = milestone("deposit", "2026-11-29");
    const series = event("weekly", { occurrences: [first, second], vendor_milestones: [proof, draft] });
    const reordered = event("weekly", { ...second, occurrences: [second, first],
      vendor_milestones: [draft, { ...proof, at: "2026-11-30T15:00Z" }] });
    const other = event("__proto__");
    expect(digestChanges(review([series, other]), snapshot([other, reordered], "2026-11-25"))).toEqual([]);
  });

  it("lists changed recurring dates and venues without including unchanged weekends", () => {
    const unchanged = { start_date: "2027-01-09", end_date: "2027-01-09" };
    const moved = { start_date: "2027-02-06", end_date: "2027-02-07", venue: "Expo" };
    const other = { start_date: "2027-03-13", end_date: "2027-03-14", venue: "Hall A" };
    const previous = event("weekly", { occurrences: [unchanged, moved, other] });
    const current = event("weekly", { occurrences: [unchanged, {
      start_date: "2027-02-20", end_date: "2027-02-21", original_start_date: moved.start_date, venue: "Expo",
    }, { ...other, venue: "Hall B" }] });
    expect(digestChanges(review([previous]), snapshot([current]))[0]?.fields).toEqual([
      { key: "dates", label: "Recurring dates", previous: ["6–7 Feb 2027 · Expo"], current: ["20–21 Feb 2027 · Expo"] },
      { key: "venue-2027-03-13/2027-03-14", label: "Venue for 13–14 Mar 2027", previous: ["Hall A"], current: ["Hall B"] },
    ]);
  });

  it("compares all venues for the same recurring dates without reporting reorder-only changes", () => {
    const dates = { start_date: "2027-01-09", end_date: "2027-01-10" };
    const hallA = { ...dates, venue: "Hall A" };
    const hallZ = { ...dates, venue: "Hall Z" };
    const before = review([event("weekly", { occurrences: [hallA, hallZ] })]);
    expect(digestChanges(before, snapshot([event("weekly", { occurrences: [hallZ, hallA] })]))).toEqual([]);

    const after = event("weekly", { occurrences: [hallZ, { ...dates, venue: "Hall B" }] });
    expect(digestChanges(before, snapshot([after]))[0].fields).toEqual([
      { key: "venue-2027-01-09/2027-01-10", label: "Venue for 9–10 Jan 2027",
        previous: ["Hall A", "Hall Z"], current: ["Hall B", "Hall Z"] },
    ]);
  });

  it("distinguishes additions, archival and removal from explicit cancellation and postponement", () => {
    const previous = review(["archive", "cancel", "postpone", "remove", "relist"].map((id) =>
      event(id, id === "relist" ? { scanner_archived: true } : {})));
    const current = snapshot([
      event("add"), event("archive", { scanner_archived: true }), event("cancel", { event_status: "cancelled" }),
      event("postpone", { event_status: "postponed", date_status: "estimated", estimated_month: "2027-04" }), event("relist"),
    ]);
    const changes = digestChanges(previous, current);
    expect(changes.map(({ id, summary }) => [id, summary])).toEqual([
      ["add", "New event · 9 Jan 2027"], ["archive", "Archived"], ["cancel", undefined], ["postpone", undefined],
      ["relist", "Relisted · 9 Jan 2027"], ["remove", "Removed from the data · 9 Jan 2027"],
    ]);
    expect(changes[1].fields).toEqual([
      { key: "listing", label: "Listing", previous: ["Active listing"], current: ["Archived listing"] },
    ]);
    expect(changes[2].fields).toEqual([
      { key: "status", label: "Event status", previous: [], current: ["Cancelled"] },
    ]);
    expect(changes[3].fields).toEqual(expect.arrayContaining([
      { key: "status", label: "Event status", previous: [], current: ["Postponed"] },
      { key: "month", label: "Estimated month", previous: [], current: ["April 2027"] },
    ]));
    for (const index of [0, 4, 5]) expect(changes[index].fields).toEqual([]);
  });

  it("reports a newly shipped archived listing as an addition with its archived state", () => {
    const archived = event("archive", { scanner_archived: true, date_status: "tba", start_date: null });
    const [change] = digestChanges(review([]), snapshot([archived]));
    expect(change.summary).toBe("New event · To be announced · Archived listing");
    expect(change.fields).toEqual([]);
  });

  it("summarizes listing changes with known dates and location while keeping meaningful edits on a relisted event", () => {
    const show = event("show", { start_date: "2026-12-11", end_date: "2026-12-13",
      city: "Wan Chai", country: "Hong Kong", venue: "Hall B" });
    expect(digestChanges(review([]), snapshot([show]))[0]).toMatchObject({
      summary: "New event · 11–13 Dec 2026 · Wan Chai, Hong Kong", fields: [],
    });
    expect(digestChanges(review([show]), snapshot([]))[0]).toMatchObject({
      summary: "Removed from the data · 11–13 Dec 2026 · Wan Chai, Hong Kong", fields: [],
    });
    const archived: Event = { ...show, scanner_archived: true, venue: "Hall A" };
    expect(digestChanges(review([archived]), snapshot([show]))[0]).toMatchObject({
      summary: "Relisted · 11–13 Dec 2026 · Wan Chai, Hong Kong",
      fields: [{ key: "venue", label: "Venue", previous: ["Hall A"], current: ["Hall B"] }],
    });
  });

  it("includes published terms and local-currency price changes while excluding quotes, FX and correspondence", () => {
    const price: VendorOption = {
      id: "standard", name: "Standard booth", amount: 350, currency: "SGD", fx_rate: 1.3,
      fx_as_of: "2026-11-24", fx_source: "https://example.com/fx", usd_amount: 269.23, basis: "published",
      kind: "package", rate_status: "current", eligibility: "eligible",
      size: "150 × 60 cm", includes: "One chair", notes: "", source: "https://example.com/rates",
    };
    const quoted: VendorOption = { ...price, id: "private-quote", name: "Private quote", basis: "quote" };
    const first = event("pricing", {
      vendor_options: [price, quoted],
      outreach: mergeOutreach(null, { published_booth_price: "SGD 350", notes: "Private outreach", quoted_price: "SGD 250" }),
    });
    const fxOnly = event("pricing", {
      vendor_options: [{ ...quoted, amount: 400 }, { ...price, fx_rate: 1.32, fx_as_of: "2026-11-26" }],
      outreach: mergeOutreach(first.outreach, { notes: "Different private outreach", quoted_price: "SGD 300" }),
    });
    expect(digestChanges(review([first]), snapshot([fxOnly]))).toEqual([]);
    const changed = event("pricing", {
      vendor_options: [{ ...price, amount: 375, includes: "Two chairs" }],
      outreach: mergeOutreach(first.outreach, { published_booth_price: "SGD 375" }),
    });
    const fields = digestChanges(review([first]), snapshot([changed]))[0].fields;
    expect(fields.map(({ key }) => key)).toEqual(["published_booth_price", "price-standard"]);
    expect(fields[1].previous).toEqual(expect.arrayContaining(["SGD 350", "Includes · One chair"]));
    expect(fields[1].current).toEqual(expect.arrayContaining(["SGD 375", "Includes · Two chairs"]));
    const taxIncluded = event("pricing", { ...changed, vendor_options: [
      { ...price, amount: 375, vat_rate: 0.09, amount_incl_vat: 408.75 },
    ] });
    expect(digestChanges(review([changed]), snapshot([taxIncluded]))[0].fields[0].current)
      .toContain("SGD 375 before VAT · SGD 408.75 including 9% VAT");
    const saved = JSON.stringify(review([first]));
    for (const privateValue of ["Private quote", "Private outreach", "quoted_price", "fx_rate", "usd_amount", "fx_source"])
      expect(saved).not.toContain(privateValue);
  });

  it("reports booking changes by milestone ID even within the same minute", () => {
    const booking = milestone("booking", "2026-11-25T12:05:40+08:00");
    const first = event("booth", { vendor_milestones: [booking] });
    const changed = event("booth", { vendor_milestones: [{ ...booking, at: "2026-11-25T12:05:50+08:00", verified: false }] });
    const [field] = digestChanges(review([first]), snapshot([changed]))[0].fields;
    expect(field).toMatchObject({ key: "milestone-booking", label: "Booking milestone" });
    expect(field.previous).toContain("25 Nov 2026, 12:05:40 Singapore");
    expect(field.current).toContain("25 Nov 2026, 12:05:50 Singapore");
    expect(field.current).toContain("Unverified date");
  });

  it("ignores player registration changes and can read checkpoints saved with the original notice text", () => {
    const storage = memoryStorage();
    const original = "Player registration closes 25 Nov 2026; Vendor booths open soon";
    const saved = review([event("show", { vendor_deadline: original })]);
    expect(saved.eventsById.show.terms.vendor_deadline).toBe("Vendor booths open soon");
    saved.eventsById.show.terms.vendor_deadline = original;
    storage.setItem(DIGEST_STORAGE_KEY, JSON.stringify(saved));

    const { checkpoint } = loadDigestCheckpoint(storage);
    const updated = (terms: string) => snapshot([event("show", {
      vendor_deadline: `Player registration closes 27 Nov 2026; ${terms}`,
    })]);
    expect(digestChanges(checkpoint, updated("Vendor booths open soon"))).toEqual([]);
    expect(digestChanges(checkpoint, updated("Vendor booths are sold out"))[0].fields).toEqual([
      { key: "vendor_deadline", label: "Vendor notice", previous: ["Vendor booths open soon"],
        current: ["Vendor booths are sold out"] },
    ]);
  });
});

describe("live weekly actions", () => {
  it("includes today through day six using Saigon days and preserves organizer-only dates", () => {
    const weekly = event("booking", { vendor_milestones: [
      milestone("today", "2026-11-24T23:00:00+08:00"),
      milestone("before-today", "2026-11-24T00:59:59+08:00"),
      milestone("saigon-midnight", "2026-11-28T01:00:00+08:00"),
      milestone("sixth-day-from-next-organizer-day", "2026-12-01T00:59:59+08:00"),
      milestone("organizer-day", "2026-11-30", { timeZone: "Asia/Hong_Kong" }),
      milestone("outside-window", "2026-12-01T01:00:00+08:00"),
      milestone("outside-organizer-day", "2026-12-01"),
    ] });
    const { today, end, days } = digestActions([weekly], now);
    expect([today, end]).toEqual(["2026-11-24", "2026-11-30"]);
    expect([...days].map(([day, items]) => [day, items.map((x) => x.kind === "milestone" && x.milestone.id)])).toEqual([
      ["2026-11-24", ["today"]],
      ["2026-11-28", ["saigon-midnight"]],
      ["2026-11-30", ["sixth-day-from-next-organizer-day", "organizer-day"]],
    ]);
    expect(days.get("2026-11-30")?.[1]).toMatchObject({ milestone: { at: "2026-11-30", timeZone: "Asia/Hong_Kong" } });
    expect(digestActions([weekly], Date.parse("2026-11-24T17:00:00Z")).today).toBe("2026-11-25");
  });

  it("places undated and unverified notices in source checks without scheduling them", () => {
    const draft = milestone("draft", "2026-11-25", { verified: false, source: "https://example.com/draft" });
    const unverified = event("unverified", { vendor_milestones: [draft] });
    const undated = event("undated", { vendor_deadline: "First come, first served", website: "https://example.com" });
    const confirmed = event("verified", { vendor_deadline: "Booking on 1 Dec 2026",
      vendor_milestones: [milestone("published", "2026-12-01", { notes: "Booking on 1 Dec 2026" })] });
    const separate = { ...confirmed, id: "separate", name: "separate", vendor_deadline: "Ask organizer about a deposit",
      website: "https://example.com/deposit" };
    const unverifiedDate = { ...separate, id: "other-date", name: "other-date", vendor_deadline: "Deposit due 11 Dec 2026" };
    const playerOnly = event("players", { vendor_deadline: "Player lottery registration closes 25 Nov; deck list due 30 Nov" });
    const { sourceChecks, days } = digestActions([unverified, undated, confirmed, separate, unverifiedDate, playerOnly], now);
    expect([...days]).toEqual([]);
    expect(sourceChecks.map(({ event, href }) => [event.id, href])).toEqual([
      ["other-date", "https://example.com/deposit"], ["separate", "https://example.com/deposit"],
      ["undated", "https://example.com"], ["unverified", "https://example.com/draft"],
    ]);
    for (const check of sourceChecks) {
      expect(check).not.toHaveProperty("due");
      expect(check).not.toHaveProperty("day");
    }
  });

  it("keeps notices with separate terms or dates on hold available for source checks", () => {
    const verified = milestone("booking", "2026-11-28", { notes: "Booking opens 28 Nov 2026" });
    const notice = "Booking opens 28 Nov 2026; deposit timing to be announced";
    const shared = { website: "https://example.com/vendors", vendor_milestones: [verified] };
    const { days, sourceChecks } = digestActions([
      event("multiple-terms", { ...shared, vendor_deadline: notice }),
      event("postponed", { ...shared, event_status: "postponed", start_date: "2026-11-20",
        vendor_deadline: "Vendor applications are on hold" }),
      event("cancelled", { ...shared, event_status: "cancelled", vendor_deadline: notice }),
    ], now);
    expect([...days.values()].flat().map(({ event }) => event.id)).toEqual(["multiple-terms"]);
    expect(sourceChecks.map(({ event, detail, href }) => [event.id, detail, href])).toEqual([
      ["multiple-terms", notice, shared.website],
      ["postponed", "Vendor applications are on hold", shared.website],
    ]);
  });

  it("filters standalone placeholder notices and retains notices with published context", () => {
    const website = "https://example.com/vendors";
    const context = "Not published for 2027. Official copy says limited partnership slots.";
    const { sourceChecks } = digestActions([
      event("uncaptured", { website, vendor_deadline: "Not captured" }),
      event("unpublished", { website, vendor_deadline: "Not published for 2027." }),
      event("edition", { website, vendor_deadline: "Not published for a 2027 edition" }),
      event("has-context", { website, vendor_deadline: context }),
    ], now);
    expect(sourceChecks.map(({ event, detail, href }) => [event.id, detail, href])).toEqual([
      ["has-context", context, website],
    ]);
  });

  it("keeps due and overdue outreach separate from later outreach, and suppresses cancelled, archived and past events", () => {
    const outreachEvent = (id: string, due: string, changes: Partial<Event> = {}) =>
      event(id, { outreach: mergeOutreach(null, { status: "contacted", follow_up_due_at: due }), ...changes });
    const events = [
      outreachEvent("today", "2026-11-24"),
      outreachEvent("overdue", "2026-11-23"),
      outreachEvent("last-day", "2026-11-30"),
      outreachEvent("outside", "2026-12-01"),
      outreachEvent("cancelled", "2026-11-23", { event_status: "cancelled", vendor_milestones: [milestone("blocked", snapshotDate)] }),
      outreachEvent("archived", "2026-11-24", { scanner_archived: true, vendor_milestones: [milestone("archived", snapshotDate)] }),
      outreachEvent("past", "2026-11-23", { start_date: "2026-11-22" }),
      event("postponed", { event_status: "postponed", vendor_milestones: [milestone("postponed", snapshotDate)] }),
    ];
    const actions = digestActions(events, now);
    expect(actions.followUps.map(({ event, due }) => [event.id, due])).toEqual([
      ["overdue", "2026-11-23"], ["today", "2026-11-24"],
    ]);
    expect([...actions.days].map(([day, items]) => [day, items.map(({ event }) => event.id)])).toEqual([
      ["2026-11-30", ["last-day"]],
    ]);
  });

  it("updates local actions immediately and leaves them intact when marking the new shipped data reviewed", () => {
    const old = event("local", { venue: "Hall A", vendor_milestones: [milestone("opening", "2026-12-02")] });
    const published = { ...old, venue: "Hall B" };
    const live = {
      ...published,
      vendor_milestones: mergeMilestones(published.vendor_milestones, [milestone("opening", "2026-11-27")]),
      outreach: mergeOutreach(published.outreach, { status: "contacted", contacted_at: "2026-11-17" }),
    };
    const storage = memoryStorage();
    saveDigestCheckpoint(snapshot([old]), storage);
    const beforeReview = digestActions([live], now);
    expect([...digestActions([published], now).days]).toEqual([]);
    expect(digestActions([published], now).followUps).toEqual([]);
    expect([...beforeReview.days.keys()]).toEqual(["2026-11-27"]);
    expect(beforeReview.followUps[0]).toMatchObject({ due: "2026-11-22" });
    const shipped = snapshot([published]);
    expect(digestChanges(loadDigestCheckpoint(storage).checkpoint, shipped)[0].fields.map(({ key }) => key)).toEqual(["venue"]);
    saveDigestCheckpoint(shipped, storage);
    expect(digestChanges(loadDigestCheckpoint(storage).checkpoint, shipped)).toEqual([]);
    expect(digestActions([live], now)).toEqual(beforeReview);
    expect(storage.getItem(DIGEST_STORAGE_KEY)).not.toContain("2026-11-27");
  });

  it("keeps the device review outside backups, CSV and calendar export", () => {
    const shipped = event("export", { vendor_milestones: [milestone("opening", "2026-11-27")] });
    const checkpoint = { ...review([shipped]), reviewedAt: "2026-09-01T02:00:00.000Z" };
    const payload = backup({});
    expect(validateBackup({ ...payload, [DIGEST_STORAGE_KEY]: checkpoint })).toEqual(validateBackup(payload));
    for (const output of [JSON.stringify(payload), csv([shipped]), ics([shipped])]) {
      expect(output).not.toContain(DIGEST_STORAGE_KEY);
      expect(output).not.toContain(checkpoint.reviewedAt);
    }
  });
});
