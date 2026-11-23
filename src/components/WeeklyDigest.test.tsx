import { load } from "cheerio";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { mergeOutreach, normalizeEvents } from "../data";
import { buildDigestSnapshot, digestActions, digestChanges, saveDigestCheckpoint } from "../weeklyDigest";
import { WeeklyDigest } from "./WeeklyDigest";

const now = Date.parse("2026-11-24T02:00:00Z");
const snapshotDate = "2026-11-24";
const events = normalizeEvents([
  { id: "booking", name: "December Show", venue: "Hall B", date_status: "confirmed", start_date: "2027-01-07",
    vendor_application: "https://example.com/apply",
    vendor_milestones: [
      { id: "open", label: "Booking opens", type: "booking_opens", verified: true,
        at: "2026-11-30T00:30+08:00", timeZone: "Asia/Singapore", source: "https://example.com/apply" },
      { id: "close", label: "Applications close", type: "application_closes", verified: true,
        at: "2026-11-30", timeZone: "Asia/Hong_Kong", source: "https://example.com/apply" },
      { id: "draft", label: "Payment notice", type: "payment_due", verified: false,
        at: "2026-11-26", timeZone: "Asia/Singapore", source: "https://example.com/payment" },
    ] },
  { id: "outreach", name: "January Show",
    outreach: mergeOutreach(null, { status: "quoted", next_action: "reply_to_organizer", follow_up_due_at: "2026-11-23" }) },
  { id: "added", name: "A New Show", date_status: "confirmed", start_date: "2026-12-11", end_date: "2026-12-13",
    city: "Wan Chai", country: "Hong Kong", vendor_deadline: "Not captured" },
]);
const current = buildDigestSnapshot(events, snapshotDate);
const previous = buildDigestSnapshot([
  { ...events[0], venue: "Hall A" }, events[1],
  ...normalizeEvents([{ id: "removed", name: "An Old Show", event_status: "postponed" }]),
], snapshotDate);
const checkpoint = saveDigestCheckpoint(previous, { setItem: vi.fn() }).checkpoint;
const actions = digestActions(events, now);
function render(review = { checkpoint: null as typeof checkpoint, error: "" }) {
  return load(renderToStaticMarkup(<WeeklyDigest actions={actions} changes={digestChanges(review.checkpoint, current)}
    review={review} now={now} snapshotDate={snapshotDate} markReviewed={vi.fn()}
    canOpen={(id) => events.some((event) => event.id === id)} openEvent={vi.fn()}
    close={vi.fn()} returnFocus={vi.fn()} />));
}

it("offers the review baseline, then gives changed values and a link only for live event records", () => {
  const initial = render();
  expect(initial("dialog").attr("aria-labelledby")).toBe("weekly-digest-title");
  expect(initial(".digest-review-action button").text()).toBe("Mark reviewed");
  expect(initial(".digest-review-status").text()).toContain("No baseline yet. Mark reviewed to start tracking changes from today.");
  expect(initial(".digest-review-status").text()).toContain("Current data from 24 Nov 2026");

  const $ = render({ checkpoint, error: "" });
  expect($(".digest-review-status").text()).toContain("Last reviewed");
  const changedEvents = $(".digest-list[aria-label='Changed events']");
  expect(changedEvents.next(".digest-review-action").find("button").text()).toBe("Mark reviewed");
  const listing = changedEvents.children("li");
  expect(listing.eq(0).find(".digest-listing").text()).toBe("New event · 11–13 Dec 2026 · Wan Chai, Hong Kong");
  expect(listing.eq(0).find("h4 a").attr("href")).toBe("/event/added");
  expect(listing.eq(1).find(".digest-listing").text()).toBe("Removed from the data · To be announced · Postponed");
  expect(listing.eq(1).find("h4 a")).toHaveLength(0);
  expect(listing.slice(0, 2).find("dl")).toHaveLength(0);
  expect(listing.last().find("h4 a").attr("href")).toBe("/event/booking");
  expect(listing.last().find("dl").text()).toBe("VenuePreviousHall ACurrentHall B");
});

it("renders the organizer date and zone, an Apply link, source checks, and the overdue queue", () => {
  const $ = render();
  expect($(".digest-day > h4 time").map((_, el) => $(el).attr("datetime")).get()).toEqual(["2026-11-29", "2026-11-30"]);
  expect($(".digest-day").first().find(".milestone-time").text()).toContain("29 Nov 2026, 23:30 Saigon");
  expect($(".digest-day").last().find(".milestone-time").text()).toBe("30 Nov 2026 · Hong Kong date");
  expect($(".digest-day .apply-cta").first().attr("href")).toBe("https://example.com/apply");
  expect($(".digest-source-link").attr("href")).toBe("https://example.com/payment");
  expect($(".digest-sources > summary").text()).toBe("Vendor notices to check (1)");
  expect($(".digest-source-preview").text()).toBe("Payment notice");
  expect($(".digest-sources time")).toHaveLength(0);
  const queue = $("section[aria-labelledby='digest-follow-up-title']");
  expect(queue.text()).toContain("January ShowYour reply is due · Overdue23 Nov 2026 · Saigon");
  expect(queue.next(".digest-sources")).toHaveLength(1);
});

it("announces a save error while keeping the prior review and its changes visible", () => {
  const $ = render({ checkpoint, error: "Could not save the review on this device." });
  expect($(".digest-review-status[role='status']").text()).toContain("Could not save the review on this device.");
  expect($(".digest-review-status").text()).toContain("Last reviewed");
  expect($(".digest-changes").text()).toContain("Hall A");
});
