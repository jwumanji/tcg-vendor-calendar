import { load } from "cheerio";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import shipped from "../../data/events.json";
import { normalizeEvents } from "../data";
import { OutreachFollowUps } from "./OutreachFollowUps";

const events = normalizeEvents(shipped);
const render = (today: string) => load(renderToStaticMarkup(
  <OutreachFollowUps events={events} today={today} open={vi.fn()} />,
));

it("labels Japan Expo's action as Justin's reply and includes the organizer's last exchange", () => {
  const $ = render("2026-11-21");
  const card = $(".outreach-follow-up-card");
  expect(card).toHaveLength(1);
  expect($("#outreach-follow-ups-title").text()).toContain("Outreach follow-ups");
  expect(card.find("strong").text()).toBe("Japan Expo Thailand 2027");
  expect(card.find(".outreach-follow-up-action").text()).toBe("Your reply is due");
  const trigger = card.find("button");
  expect(trigger.text()).not.toContain("Organizer reply");
  expect(card.find("#" + trigger.attr("aria-describedby")).text()).toContain("Organizer reply");
  expect(card.text()).toContain("Organizer reply · 19 Nov 2026");
  expect(card.text()).toContain("what business and products GrailFox will sell");
  expect(card.text()).toContain("Booth quote pending");
  expect(card.find(".outreach-follow-up-notes")).toHaveLength(1);
  expect(card.text()).not.toContain("1a1f365362759e5c");
});

it("caps the queue and labels a nudge for an automatic acknowledgement", () => {
  const $ = render("2026-11-24");
  expect($(".outreach-follow-up-card")).toHaveLength(3);
  expect($("button[aria-controls='outreach-follow-ups-list']").text()).toBe("Show 3 more follow-ups");
  const ack = load(renderToStaticMarkup(
    <OutreachFollowUps events={events.filter(({ id }) => id === "hktdc")} today="2026-11-24" open={vi.fn()} />,
  ))(".outreach-follow-up-card");
  expect(ack.text()).toContain("Organizer nudge due");
  expect(ack.text()).toContain("Awaiting a human reply");
  expect(ack.text()).toContain("Last exchange · Automatic acknowledgement · 20 Nov 2026");
  expect(ack.text()).not.toContain("1a1f5d493ba2a84d");
});

it("omits the section when there are no due actions", () => {
  expect(render("2026-11-18")("section")).toHaveLength(0);
});

it("offers a collapsed summary with the full number of follow-ups due", () => {
  const $ = load(renderToStaticMarkup(
    <OutreachFollowUps events={events} today="2026-11-24" open={vi.fn()} bannerExpanded={false} toggle={vi.fn()} />,
  ));
  const summary = $(".reminder-summary");
  expect(summary.attr("aria-expanded")).toBe("false");
  expect(summary.text()).toContain("6 follow-ups due");
  expect($("#" + summary.attr("aria-controls")).is("[hidden]")).toBe(true);
});
