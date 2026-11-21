import { describe, expect, it } from "vitest";
import shipped from "../data/events.json";
import savedBackup from "../tests/fixtures/outreach-backup-v1.json";
import { mergeOutreach, normalizeEvents, reconcileOutreachOverlay } from "./data";
import { dueOutreach, followUp } from "./outreach";
import { loadEntries } from "./storage";

const events = normalizeEvents(shipped);
const event = (id: string) => events.find((event) => event.id === id)!;

describe("outreach follow-ups", () => {
  it.each(["replied", "quoted"] as const)("closes a pending nudge when the organizer has %s", (status) => {
    const contacted = event("r-sunday");
    expect(dueOutreach([contacted], "2026-11-24")).toMatchObject([{ kind: "nudge", due: "2026-11-24" }]);
    const outreach = mergeOutreach(contacted.outreach, {
      status, response_at: "2026-11-23", follow_up_due_at: "2026-11-24",
    });
    expect(dueOutreach([{ ...contacted, outreach }], "2026-11-24")).toEqual([]);
  });

  it("keeps HKTDC due on the original cadence when only an automatic acknowledgement arrives", () => {
    const hktdc = event("hktdc");
    expect(hktdc.outreach).toMatchObject({
      status: "contacted", response_at: null, acknowledgement_at: "2026-11-20",
      message_ref: "1a1f5d493ba2a84d",
    });
    expect(hktdc.outreach?.notes).toContain("2026-11-19 at 22:01:26 UTC");
    expect(dueOutreach([hktdc], "2026-11-23")).toEqual([]);
    expect(dueOutreach([hktdc], "2026-11-24")).toMatchObject([{ kind: "nudge", due: "2026-11-24" }]);
  });

  it.each(["2026-11-19", "2026-11-22"])(
    "keeps the shared acknowledgement and a locally recorded human reply from %s",
    (response_at) => {
      const hktdc = event("hktdc");
      const saved = {
        status: "replied", response_at, message_ref: "human-reply", acknowledgement_at: null,
      } as const;
      const outreach = mergeOutreach(hktdc.outreach, reconcileOutreachOverlay(hktdc.outreach, saved));
      expect(outreach).toMatchObject({ ...saved, acknowledgement_at: "2026-11-20" });
      expect(dueOutreach([{ ...hktdc, outreach }], "2026-11-24")).toEqual([]);
    },
  );

  it("reminds Justin to answer Japan Expo and removes the task when he clears the next action", () => {
    const japan = event("jet-2027");
    expect(japan.outreach).toMatchObject({ status: "replied", quoted_price: null });
    expect(dueOutreach([japan], "2026-11-21")).toMatchObject([{ kind: "reply", due: "2026-11-19" }]);
    const outreach = mergeOutreach(japan.outreach, { next_action: null });
    expect(dueOutreach([{ ...japan, outreach }], "2026-11-21")).toEqual([]);
  });

  it("applies Japan Expo's same-day seeded reply over the sent exchange in a version 1 backup", () => {
    const japan = event("jet-2027");
    const { outreach: patches } = loadEntries({ getItem: () => JSON.stringify(savedBackup) });
    const outreach = mergeOutreach(japan.outreach, reconcileOutreachOverlay(japan.outreach, patches[japan.id]));
    expect(outreach).toMatchObject({
      status: "replied", contacted_at: "2026-11-19", response_at: "2026-11-19",
      message_ref: "1a1f365362759e5c", next_action: "reply_to_organizer", follow_up_due_at: null,
      contact: "info@gyucreative.com", notes: "Local note to keep.",
    });
    expect(dueOutreach([{ ...japan, outreach }], "2026-11-21")).toMatchObject([{ kind: "reply", due: "2026-11-19" }]);
    const { status: _status, ...legacyFields } = patches[japan.id];
    expect(reconcileOutreachOverlay(japan.outreach, legacyFields)).toEqual({
      contact: "info@gyucreative.com", notes: "Local note to keep.",
    });
  });

  it("keeps local exchanges that are newer than the shared reply and applies edits to the shared exchange", () => {
    const japan = event("jet-2027");
    const laterQuote = {
      status: "quoted", response_at: "2026-11-22", message_ref: "new-quote", next_action: null,
    } as const;
    const clearedAction = { next_action: null, message_ref: japan.outreach?.message_ref, response_at: "2026-11-19" };
    expect(reconcileOutreachOverlay(japan.outreach, laterQuote)).toBe(laterQuote);
    expect(reconcileOutreachOverlay(japan.outreach, clearedAction)).toBe(clearedAction);
  });

  it("puts replies ahead of nudges even when a nudge has an earlier due date", () => {
    const japan = event("jet-2027");
    const comifuro = event("comifuro24");
    const outreach = mergeOutreach(comifuro.outreach, { follow_up_due_at: "2026-11-18" });
    expect(dueOutreach([{ ...comifuro, outreach }, japan], "2026-11-21").map(({ kind }) => kind))
      .toEqual(["reply", "nudge"]);
  });

  it("honors Comifuro's reply window and includes the other unanswered enquiries when due", () => {
    expect(dueOutreach(events, "2026-11-21").map(({ event }) => event.id)).toEqual(["jet-2027"]);
    expect(dueOutreach(events, "2026-11-23").map(({ event }) => event.id)).toEqual(["jet-2027", "comifuro24"]);
    expect(dueOutreach(events, "2026-11-24").map(({ event }) => event.id)).toEqual([
      "jet-2027", "comifuro24", "connectcon2", "hktdc", "mtg-sea-r2", "r-sunday",
    ]);
  });

  it("supports a manual due date on older records with no contact date", () => {
    const outreach = mergeOutreach(null, { status: "contacted" });
    expect(followUp(outreach)).toBeUndefined();
    expect(followUp({ ...outreach, follow_up_due_at: "2026-12-01" })).toEqual({
      kind: "nudge", due: "2026-12-01",
    });
  });

  it("omits past and cancelled editions", () => {
    const contacted = event("connectcon2");
    expect(dueOutreach([contacted], "2027-02-01")).toEqual([]);
    expect(dueOutreach([{ ...contacted, event_status: "cancelled" }], "2026-11-24")).toEqual([]);
  });
});
