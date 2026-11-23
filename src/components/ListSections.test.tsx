import { load } from "cheerio";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import fixtures from "../../tests/fixtures/new-finds.json";
import shipped from "../../data/events.json";
import { mergeOutreach, normalizeEvents } from "../data";
import { defaultRowSort, groupSortedRows, orderTimelineGroups, sortRows, type OptionalColumn, type RowSort } from "../rows";
import { scoreEvents } from "../scoring";
import { emptyFilters } from "../model";
import { ics, matches, matchingEvent, timelineGroups } from "../utils";
import { emptyEntry, stages, type Entries } from "../storage";
import { Detail } from "./Detail";
import { EventCard } from "./EventCard";
import { EventRows, RowSortControl } from "./EventRows";
import { CardSections } from "./ListSections";
import { CalendarView } from "./CalendarView";
import { Pipeline } from "./Pipeline";
import { TopPicks } from "./TopPicks";
import { BookingMilestones } from "./BookingMilestones";
import { UpcomingMilestones } from "./UpcomingMilestones";

const today = "2026-11-18";
const [harbour, kowloon, pasar] = normalizeEvents(fixtures);
const event = { ...harbour, vendor_score: 51 };
const events = [event, kowloon, pasar, { ...pasar, id: "estimate", estimated_month: "2027-01" }];
const scores = Object.fromEntries(scoreEvents(events, { today }).map((score) => [score.id, score]));
const shared = { entries: {}, open: vi.fn(), setGoing: vi.fn(), setStage: vi.fn() };
const milestoneActions = { onSave: vi.fn(), onRemove: vi.fn() };
const booking = {
  id: "general-booking", type: "booking_opens" as const, at: "2026-12-01T00:00+08:00",
  timeZone: "Asia/Singapore", label: "General booking opens", source: "https://example.com/booking",
  verified: true,
};

it("renders a keyboard-accessible reminder list ordered by booking time", () => {
  const clock = vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-21T00:00:00Z"));
  try {
    const $ = load(renderToStaticMarkup(<UpcomingMilestones open={shared.open} events={[
      { ...kowloon, vendor_milestones: [{ ...booking, at: "2026-12-01T12:00+08:00" }] },
      { ...event, vendor_application: "https://example.com/apply", vendor_milestones: [{ ...booking, type: "application_closes" }] },
      { ...pasar, event_status: "cancelled", vendor_milestones: [booking] },
    ]} />));
    expect($(".milestone-card strong").map((_, el) => $(el).text()).get()).toEqual([event.name, kowloon.name]);
    const time = $(".milestone-card time").first();
    expect(time.attr("datetime")).toBe(booking.at);
    expect(time.find("span").map((_, el) => $(el).text()).get()).toEqual([
      "30 Nov 2026, 23:00 Saigon", "1 Dec 2026, 00:00 Singapore",
    ]);
    expect($(".milestone-countdown").first().text()).toBe("in 9 days");
    expect($(".upcoming-milestones .milestone-export")).toHaveLength(2);
    expect($(".upcoming-milestones .apply-cta").attr("href")).toBe("https://example.com/apply");
    expect($(".upcoming-milestones .apply-cta").attr("aria-label")).toBe(`Apply for ${event.name}`);
    expect($(".milestone-card .apply-cta")).toHaveLength(0);
  } finally {
    clock.mockRestore();
  }
});

it("offers the upcoming milestones as a single collapsed summary", () => {
  const clock = vi.spyOn(Date, "now").mockReturnValue(Date.parse(today));
  try {
    const $ = load(renderToStaticMarkup(<UpcomingMilestones open={shared.open} bannerExpanded={false} toggle={vi.fn()}
      events={[{ ...event, vendor_milestones: [booking] }]} />));
    const summary = $(".reminder-summary");
    expect(summary.attr("aria-expanded")).toBe("false");
    expect(summary.text()).toContain("1 upcoming vendor date");
    expect($("#" + summary.attr("aria-controls")).is("[hidden]")).toBe(true);
  } finally {
    clock.mockRestore();
  }
});

it("renders an event empty state and only shows a calendar action for verified booking dates", () => {
  const empty = load(renderToStaticMarkup(<BookingMilestones event={event} {...milestoneActions} />));
  expect(empty(".booking-milestones > p").text()).toBe("No booking milestones recorded yet.");
  expect(empty("button").text()).toContain("Add milestone");
  const draft = { ...booking, id: "draft", verified: false };
  const $ = load(renderToStaticMarkup(<BookingMilestones event={{ ...event, vendor_milestones: [booking, draft] }}
    sharedMilestones={[booking]} localMilestones={[booking, draft]} {...milestoneActions} />));
  expect($("button[aria-label^='Add to calendar']")).toHaveLength(1);
  expect($("button[aria-label='Edit General booking opens']")).toHaveLength(2);
  expect($("a[aria-label='Source for General booking opens']").first().attr("href")).toBe(booking.source);
  expect($(".milestone-badge").text()).toBe("Unverified date");
  expect($(".booking-milestones").text()).toContain("Verify this date to add it to your calendar.");
  expect($("button[aria-label^='Reset to shared']")).toHaveLength(1);
  expect($("button[aria-label^='Delete local milestone']")).toHaveLength(1);
});

it.each([
  ["cardcon3", "30 Nov 2026, 23:00 Saigon"],
  ["bkk-card-show", "1 Dec 2026, 12:00 Bangkok / Saigon"],
])("shows the corrected vendor notice on the %s event page", (id, notice) => {
  const e = normalizeEvents(shipped).find((row) => row.id === id)!;
  const $ = load(renderToStaticMarkup(<Detail today={today} e={e} entry={emptyEntry} score={scoreEvents([e])[0]}
    saved setGoing={shared.setGoing} onStage={vi.fn()} onNote={vi.fn()} onOutreach={vi.fn()} onMilestone={vi.fn()}
    onRemoveMilestone={vi.fn()} setOverride={vi.fn()} openClash={vi.fn()} toast={null} />));
  expect($(".decision-facts time").text()).toContain(notice);
  expect($("body").text()).not.toMatch(/Card Con 2 exhibitors first|Not published \(zone-based, book early\)/);
});

it("labels postponed bookings as on hold and removes their calendar action and vendor notice", () => {
  const e = { ...event, event_status: "postponed" as const, vendor_milestones: [booking], vendor_deadline: "Old booking notice" };
  const $ = load(renderToStaticMarkup(<Detail today={today} e={e} entry={emptyEntry} score={scoreEvents([e])[0]}
    saved setGoing={shared.setGoing} onStage={vi.fn()} onNote={vi.fn()} onOutreach={vi.fn()} onMilestone={vi.fn()}
    onRemoveMilestone={vi.fn()} setOverride={vi.fn()} openClash={vi.fn()} toast={null} />));
  expect($(".milestone-badge").text()).toBe("Booking date on hold");
  expect($(".booking-milestones").text()).toContain("Calendar export is paused while the event is postponed.");
  expect($(".booking-milestones .milestone-export, .booking-milestones .milestone-countdown")).toHaveLength(0);
  expect($("body").text()).not.toContain("Old booking notice");
});

function layouts(sort: RowSort, columns: OptionalColumn[] = [], list = events, results = scores, entries: Entries = {}) {
  const sorted = sortRows(list, sort, entries, results, today);
  const groups = groupSortedRows(sorted, sort.key, today);
  const grid = (
    <CardSections groups={groups} sortKey={sort.key}>
      {(e, titleLevel) => (
        <EventCard key={e.id} e={e} entry={entries[e.id] || emptyEntry} score={results[e.id]}
          today={today} now={Date.parse(today)} titleLevel={titleLevel} columns={columns} {...shared} entries={entries} />
      )}
    </CardSections>
  );
  const rows = (
    <EventRows groups={groups} sort={sort} columns={columns}
      today={today} now={Date.parse(today)} scores={results} {...shared} entries={entries} />
  );
  return { grid: load(renderToStaticMarkup(grid)), rows: load(renderToStaticMarkup(rows)) };
}

it("renders matching stage controls and vendor actions on Grid and Rows", () => {
  const list = [
    { ...event, vendor_application: "https://example.com/apply" },
    { ...kowloon, vendor_application: "https://example.com/register-interest" },
    { ...pasar, vendor_application: "https://example.com/apply", vendor_booths: "Applications closed" },
  ];
  const entries = { [kowloon.id]: { ...emptyEntry, stage: "Quote received" as const } };
  const { grid, rows } = layouts({ key: "stage", direction: "desc" }, [], list, scores, entries);
  for (const $ of [grid, rows]) {
    expect($(".stage-picker option[selected]").map((_, el) => $(el).text()).get())
      .toEqual(["Quote received", "Not reviewed", "Not reviewed"]);
    const picker = $(".stage-picker").first();
    expect(picker.attr("aria-label")).toBe(`Pipeline stage for ${kowloon.name}`);
    expect(picker.find("option").map((_, el) => $(el).text()).get()).toEqual([...stages]);
    expect($(".apply-cta").map((_, el) => [$(el).text(), $(el).attr("href")]).get())
      .toEqual(["Register interest", "https://example.com/register-interest", "Apply", "https://example.com/apply"]);
  }
});

describe("Grid and Rows sections", () => {
  it.each<[RowSort, string[]]>([
    [defaultRowSort, ["January 2027 · 2 events", "March 2027 · 1 event", "Dates not announced · 1 event"]],
    [{ key: "dates", direction: "desc" }, ["March 2027 · 1 event", "January 2027 · 2 events", "Dates not announced · 1 event"]],
    [{ key: "country", direction: "asc" }, ["Hong Kong · 1 event", "Malaysia · 2 events", "Singapore · 1 event"]],
    [{ key: "priority", direction: "desc" }, []],
  ])("renders the shared groups and headings for %o", (sort, expected) => {
    const { grid, rows } = layouts(sort);
    for (const $ of [grid, rows]) {
      expect($("h3.list-section-heading").map((_, el) => $(el).text()).get()).toEqual(expected);
      expect($("h3.list-section-heading .flag-img")).toHaveLength(sort.key === "country" ? expected.length : 0);
    }
    expect(grid("section > h3 + .cards")).toHaveLength(expected.length);
    expect(grid(".cards")).toHaveLength(expected.length || 1);
    expect(grid(expected.length ? "section h4.card-title" : "h3.card-title")).toHaveLength(events.length);
    expect(rows("th[scope=rowgroup] h3")).toHaveLength(expected.length);
    expect(grid(".cards .card-title button").map((_, el) => grid(el).contents().first().text()).get())
      .toEqual(rows(".row-name").map((_, el) => rows(el).contents().first().text()).get());
  });

  it("shows the dates used for grouping on recurring cards and TBA events with an estimate", () => {
    const recurring = {
      ...event,
      start_date: "2026-10-31",
      end_date: "2026-11-01",
      occurrences: [
        { start_date: "2026-10-31", end_date: "2026-11-01" },
        { start_date: "2027-01-31", end_date: "2027-02-01" },
      ],
    };
    const estimate = events[3];
    expect(estimate.date_status).toBe("tba");
    const { grid, rows } = layouts(defaultRowSort, [], [recurring, estimate]);
    expect(grid(".list-section-heading").text()).toBe("January 2027 · 2 events");
    expect(grid(".card-when .row-date-label").map((_, el) => grid(el).text()).get())
      .toEqual(["31 Jan 2027 – 1 Feb 2027", "Est. January 2027"]);
    expect(grid(".event-card").last().find(".badge.tba").text()).toContain("Dates not announced");
    expect(rows(".row-dates").first().text()).toBe("31 Jan 2027 – 1 Feb 2027 ● Confirmed");
    expect(rows(".row-dates[data-status=tba]").text()).toBe("Est. January 2027 ◇ Dates not announced");
  });
});

it("shows only priority chips on list cards, rows, pipeline cards and top picks", () => {
  const { grid, rows } = layouts(defaultRowSort);
  const pipeline = <Pipeline today={today} sort={defaultRowSort} events={[event]} scores={scores} change={vi.fn()} {...shared} />;
  const picks = <TopPicks events={[event]} scores={scores} today={today} {...shared} />;
  for (const $ of [grid, rows, load(renderToStaticMarkup(pipeline)), load(renderToStaticMarkup(picks))]) {
    expect($(".priority-chip").length).toBeGreaterThan(0);
    expect($(".gem, .gem-tier, [data-tier], [title^='Fit score']")).toHaveLength(0);
  }
  expect(rows(".row-scanner")).toHaveLength(0);
  const { rows: optedIn } = layouts(defaultRowSort, ["scanner"]);
  expect(optedIn(".row-scanner").first().contents().last().text()).toBe("51");
  expect(optedIn(".gem")).toHaveLength(0);
});

it("shows outreach wording in Grid and Rows with an opt-in sortable column and no quiet list chips", () => {
  const list = [
    { ...event, outreach: mergeOutreach(null, { status: "contacted", method: "email" }) },
    { ...kowloon, outreach: mergeOutreach(null, { status: "replied", method: "form" }) },
    { ...pasar, outreach: mergeOutreach(null, { status: "quoted", method: "email" }) },
    events[3],
  ];
  const sort = { key: "outreach", direction: "asc" } as const;
  const { grid, rows } = layouts(sort, [], list);
  for (const $ of [grid, rows]) {
    const chips = $(".outreach-chip").clone();
    chips.find(".sr-only").remove();
    expect(chips.map((_, el) => $(el).text()).get()).toEqual(["Contacted · Email", "Replied · Form", "Quoted · Email"]);
    expect($(".priority-chip")).toHaveLength(list.length);
  }
  expect(rows(".row-outreach")).toHaveLength(0);
  const { rows: withColumn, grid: withField } = layouts(sort, ["outreach"], list);
  expect(withColumn(".col-outreach").attr("aria-sort")).toBe("ascending");
  expect(withColumn(".row-outreach .outreach-chip")).toHaveLength(3);
  expect(withColumn(".row-priority .outreach-chip")).toHaveLength(0);
  expect(withField(".card-option-outreach .outreach-chip")).toHaveLength(3);
  expect(withField(".card-tags .outreach-chip")).toHaveLength(0);
});

it.each([
  ["sales@example.com", null, "mailto:sales@example.com", "sales@example.com"],
  ["Use the official form", "https://example.com/contact", "https://example.com/contact", "https://example.com/contact"],
])("uses a direct event route for %s when no outreach route is seeded", (contact, vendor_application, href, label) => {
  const $ = load(renderToStaticMarkup(
    <Detail today={today} e={{ ...event, contact, vendor_application }} entry={emptyEntry}
      score={scores[event.id]} saved setGoing={shared.setGoing}
      onStage={vi.fn()} onNote={vi.fn()} onOutreach={vi.fn()} onMilestone={vi.fn()} onRemoveMilestone={vi.fn()} setOverride={vi.fn()} openClash={vi.fn()} toast={null} />,
  ));
  expect($(".outreach-section a").attr("href")).toBe(href);
  expect($(".outreach-section a").text()).toBe(label);
});

it("labels the event outreach section, editor, research links and prices independently of pipeline", () => {
  const outreach = mergeOutreach(null, {
    contact_type: "form", contact: "https://example.com/apply",
    published_booth_price: "$200", price_source_url: "https://example.com/prices",
  });
  const $ = load(renderToStaticMarkup(
    <Detail today={today} e={{ ...event, outreach }} knownOutreach={outreach} entry={emptyEntry}
      score={scores[event.id]} saved setGoing={shared.setGoing}
      onStage={vi.fn()} onNote={vi.fn()} onOutreach={vi.fn()} onMilestone={vi.fn()} onRemoveMilestone={vi.fn()} setOverride={vi.fn()} openClash={vi.fn()} toast={null} />,
  ));
  const section = $("section[aria-labelledby='outreach-heading']");
  expect($("#outreach-heading").text()).toBe("Outreach");
  expect(section.find(".outreach-summary").text()).toBe("Not contacted");
  expect(section.find(".outreach-research a").attr("href")).toBe("https://example.com/apply");
  expect($(".vendor-money a").filter((_, el) => $(el).text() === "Outreach price source").attr("href")).toBe("https://example.com/prices");
  expect($(".vendor-money").text()).toContain("$200");
  expect(section.find("label").map((_, el) => $(el).contents().first().text()).get()).toEqual([
    "Outreach status", "Outreach method", "Contact address or URL", "Contacted on",
    "Response date", "Next action", "Follow-up due date", "Message reference", "Quoted price", "Outreach notes",
  ]);
  expect(section.find("button").text()).toBe("Save outreach");
  expect($(".decision-stage option[selected]").text()).toBe("Not reviewed");
  expect($("label[for=detail-stage]").text()).toBe("Pipeline stage");
});

it("keeps the fit rating in the event page priority breakdown", () => {
  const $ = load(renderToStaticMarkup(
    <Detail today={today} e={event} entry={emptyEntry} score={scores[event.id]} saved setGoing={shared.setGoing}
      onStage={vi.fn()} onNote={vi.fn()} onOutreach={vi.fn()} onMilestone={vi.fn()} onRemoveMilestone={vi.fn()} setOverride={vi.fn()} openClash={vi.fn()} toast={null} />,
  ));
  const factor = $(".priority-detail details").filter((_, el) => $(el).find("summary").text().includes("Fit score"));
  expect(factor).toHaveLength(1);
  expect(factor.text()).toContain("Vendor fit rating 51/100");
  expect($("meter, .vendor-meter, .gem")).toHaveLength(0);
});

it("shows the same home-base Priority in Grid, Rows, Top picks and event details", () => {
  const list = [event];
  const defaultScore = scoreEvents(list, { today })[0].score;
  const result = scoreEvents(list, { today, homeBase: "au-sydney" })[0];
  expect(result.score).toBeLessThan(defaultScore);
  const results = { [event.id]: result };
  const { grid, rows } = layouts({ key: "priority", direction: "desc" }, [], list, results);
  const picks = load(renderToStaticMarkup(<TopPicks events={list} scores={results} today={today} {...shared} />));
  const detail = load(renderToStaticMarkup(<Detail today={today} e={event} score={result} entry={emptyEntry}
    saved setGoing={shared.setGoing} onStage={vi.fn()} onNote={vi.fn()} onOutreach={vi.fn()} onMilestone={vi.fn()}
    onRemoveMilestone={vi.fn()} setOverride={vi.fn()} openClash={vi.fn()} toast={null} />));
  const label = grid(".priority-chip").attr("aria-label");
  expect(label).toContain(`Score ${result.score} of 100`);
  expect(rows(".priority-chip").attr("aria-label")).toBe(label);
  expect(picks(".priority-chip").attr("aria-label")).toBe(label);
  expect(detail(".decision-score .priority-chip").attr("aria-label")).toBe(label);
  expect(detail(".priority-detail").text()).toContain("Travel from Sydney, Australia to Singapore (estimated: Other international)");
});

it("shows the same schedule status and zero priority in Rows and Grid and excludes cancellations from picks and deadlines", () => {
  const cancelled = { ...event, event_status: "cancelled" as const, vendor_deadline: "1 Dec 2026" };
  const postponed = { ...kowloon, event_status: "postponed" as const };
  const list = [cancelled, postponed];
  const results = Object.fromEntries(scoreEvents(list, { overrides: { [event.id]: 100 } }).map((r) => [r.id, r]));
  const { grid, rows } = layouts({ key: "priority", direction: "desc" }, [], list, results);
  for (const $ of [grid, rows]) {
    expect($(".badge.cancelled").text()).toBe("Cancelled");
    expect($(".badge.postponed").text()).toBe("Postponed");
    expect($(".priority-chip").last().attr("aria-label")).toContain("Score 0 of 100, Cancelled");
  }
  const picks = load(renderToStaticMarkup(<TopPicks events={list} scores={results} today={today} {...shared} />));
  expect(picks(".overview").text()).not.toContain(cancelled.name);
  expect(picks(".pick .badge.postponed").text()).toBe("Postponed");
  expect(rows(".row-name").first().text()).toBe(postponed.name);
  const cell = rows(".row-dates").last();
  expect(cell.attr("title")).toMatch(/^cancelled · /);
  expect(cell.text()).toMatch(/ Cancelled$/);
  expect(cell.text()).not.toContain("Confirmed");
  expect(matches(cancelled, { ...emptyFilters, status: "cancelled" }, {})).toBe(true);
  expect(matches(cancelled, { ...emptyFilters, status: "confirmed" }, {})).toBe(false);
});

it("shows the selected sort in the labelled control and in passive headers when the column is visible", () => {
  const sort = { key: "scanner", direction: "desc" } as const;
  const $ = load(renderToStaticMarkup(<RowSortControl sort={sort} setSort={vi.fn()} />));
  expect($("label").text()).toBe("Sort by");
  expect($("select option[selected]").text()).toBe("Fit score");
  expect($("button[aria-pressed=true]")).toHaveLength(1);
  expect(layouts(sort).rows("th[aria-sort]")).toHaveLength(0);
  const { rows } = layouts(sort, ["scanner"]);
  expect(rows("th[aria-sort=descending]").text()).toBe("Fit score");
  expect(rows("thead th button")).toHaveLength(0);
});

it("labels cancelled calendar dates, undated postponements, pipeline cards and event details", () => {
  const cancelled = { ...event, event_status: "cancelled" as const, date_note: "Event has been cancelled" };
  const postponed = { ...pasar, event_status: "postponed" as const };
  const list = [cancelled, postponed];
  const results = Object.fromEntries(scoreEvents(list).map((r) => [r.id, r]));
  const month = cancelled.start_date!.slice(0, 7);
  const calendar = load(renderToStaticMarkup(<CalendarView filtered={list} month={month} initialMonth={month}
    today={today} scores={results} setMonth={vi.fn()} {...shared} />));
  expect(calendar(".month-header span").first().text()).toBe("1 dated show · 0 estimated");
  expect(calendar(".calendar-event .badge.cancelled").first().text()).toBe("Cancelled");
  expect(calendar(".tba-links .badge.postponed").text()).toBe("Postponed");
  const pipeline = load(renderToStaticMarkup(<Pipeline today={today} sort={defaultRowSort} events={list} scores={results} change={vi.fn()} {...shared} />));
  expect(pipeline(".pcard-date .badge.cancelled")).toHaveLength(1);
  expect(pipeline(".pcard-date .badge.postponed")).toHaveLength(1);
  const detail = load(renderToStaticMarkup(<Detail today={today} e={cancelled} score={results[cancelled.id]} entry={emptyEntry}
    saved setGoing={shared.setGoing} onStage={vi.fn()} onNote={vi.fn()} onOutreach={vi.fn()} onMilestone={vi.fn()} onRemoveMilestone={vi.fn()}
    setOverride={vi.fn()} openClash={vi.fn()} toast={null} />));
  expect(detail(".badge.cancelled").text()).toBe("Cancelled");
  expect(detail(".event-information dl").text()).toContain(cancelled.date_note);
  expect(detail(".override-form, .clash-note")).toHaveLength(0);
});

it("orders Rows, Pipeline columns and Timeline stage groups by the same descending stage selection", () => {
  const sort: RowSort = { key: "stage", direction: "desc" };
  const entries = { [kowloon.id]: { ...emptyEntry, stage: "Contacted" as const } };
  const sorted = sortRows([event, kowloon], sort, entries, scores, today);
  const groups = groupSortedRows(sorted, sort.key, today);
  const rows = load(renderToStaticMarkup(<EventRows groups={groups} sort={sort} columns={[]}
    today={today} scores={scores} {...shared} entries={entries} />));
  const pipeline = load(renderToStaticMarkup(<Pipeline today={today} sort={sort} events={sorted} scores={scores}
    change={vi.fn()} {...shared} entries={entries} />));
  expect(rows(".row-name").map((_, el) => rows(el).text()).get()).toEqual([kowloon.name, event.name]);
  expect(pipeline(".pcard-title button").map((_, el) => pipeline(el).contents().first().text()).get())
    .toEqual([kowloon.name, event.name]);
  const timeline = orderTimelineGroups(timelineGroups(sorted, emptyFilters, entries, true), true, sort);
  expect(timeline.map(([stage]) => stage)).toEqual(["Contacted", "Not reviewed"]);
});

it.each([
  { from: "2027-03-01", to: "2027-03-31" },
  { next90: true },
])("shows only the matching weekend in Rows, Pipeline, Timeline and Calendar with %o", (window) => {
  const occurrences = ["2027-01-09", "2027-03-13"].map((date) => ({ start_date: date, end_date: date }));
  const recurring = { ...event, ...occurrences[0], occurrences };
  const match = matchingEvent(recurring, { ...emptyFilters, ...window }, {}, 0, "2027-03-01")!;
  const { rows, grid } = layouts(defaultRowSort, [], [match]);
  expect(rows(".row-dates").text()).toContain("13 Mar");
  expect(grid(".card-when").text()).toContain("13 Mar");
  const pipeline = load(renderToStaticMarkup(<Pipeline today={today} sort={defaultRowSort} events={[match]} scores={scores}
    change={vi.fn()} {...shared} />));
  expect(pipeline(".pcard-line").first().text()).toContain("13 Mar");
  expect([...timelineGroups([recurring], { ...emptyFilters, ...window }, {}, false, "2027-03-01").keys()]).toEqual(["2027-03"]);
  for (const month of ["2027-01", "2027-03"]) {
    const calendar = load(renderToStaticMarkup(<CalendarView filtered={[match]} month={month} initialMonth={month}
      today={today} scores={scores} setMonth={vi.fn()} {...shared} />));
    const count = month === "2027-03" ? 1 : 0;
    expect(calendar(".calendar-event")).toHaveLength(count);
    expect(calendar(".mobile-agenda .event-card")).toHaveLength(count);
  }
});

it("announces priority rank in each title when rank two precedes rank one", () => {
  const results = { ...scores, [event.id]: { ...scores[event.id], score: 55 }, [kowloon.id]: { ...scores[kowloon.id], score: 90 } };
  const picks = load(renderToStaticMarkup(<TopPicks events={[event, kowloon]} scores={results} today={today} {...shared} />));
  const titles = picks(".pick h3 button");
  expect(titles).toHaveLength(2);
  expect(titles.eq(0).text()).toContain(event.name + " · Priority rank 2");
  expect(titles.eq(1).text()).toContain(kowloon.name + " · Priority rank 1");
  expect(titles.find("[aria-hidden=true]")).toHaveLength(0);
});

it("places a January–February show only on its filtered February days and exports the published range", () => {
  const crossing = { ...event, start_date: "2027-01-30", end_date: "2027-02-02" };
  const filter = { ...emptyFilters, from: "2027-02-01", to: "2027-02-28" };
  const match = matchingEvent(crossing, filter, {}, 0, today)!;
  const groups = timelineGroups([match], filter, {}, false, today);
  expect([...groups.keys()]).toEqual(["2027-02"]);
  expect([...groupSortedRows([match], "dates", today).keys()]).toEqual(["2027-02"]);
  for (const month of ["2027-01", "2027-02"]) {
    const calendar = load(renderToStaticMarkup(<CalendarView filtered={[match]} month={month} initialMonth={month}
      today={today} scores={scores} setMonth={vi.fn()} {...shared} />));
    const days = calendar(".day:has(.calendar-event)").map((_, el) => calendar(el).attr("aria-label")).get();
    expect(days).toEqual(month === "2027-02" ? ["1 Feb 2027", "2 Feb 2027"] : []);
    expect(calendar(".mobile-agenda .event-card")).toHaveLength(month === "2027-02" ? 1 : 0);
  }
  expect(ics([match])).toContain("DTSTART;VALUE=DATE:20270130\r\nDTEND;VALUE=DATE:20270203");
});

it("uses the upcoming Centrepoint weekend in visible dates and accessible titles between occurrences", () => {
  const day = "2027-02-01";
  const occurrences = [
    { start_date: "2027-01-30", end_date: "2027-01-31" },
    { start_date: "2027-02-13", end_date: "2027-02-14" },
  ];
  const series = { ...event, name: "NEXUS Centrepoint", ...occurrences[0], occurrences };
  const pipeline = load(renderToStaticMarkup(<Pipeline today={day} sort={defaultRowSort} events={[series]} scores={scores}
    change={vi.fn()} {...shared} />));
  const picks = load(renderToStaticMarkup(<TopPicks events={[series]} scores={scores} today={day} {...shared} />));
  for (const text of [pipeline(".pcard-line").first().text(), pipeline(".pcard-title button").text(),
    picks(".pick p").text(), picks(".pick h3 button").text()]) {
    expect(text).toContain("13–14 Feb 2027");
    expect(text).not.toContain("Jan");
  }
});

it("shows the same date, status and action order across Grid, Rows and Pipeline", () => {
  const e = { ...event, start_date: "2027-01-03", end_date: "2027-01-05", vendor_application: "https://example.com/apply" };
  const { grid, rows } = layouts(defaultRowSort, ["scanner", "source"], [e]);
  const pipeline = load(renderToStaticMarkup(<Pipeline today={today} sort={defaultRowSort} events={[e]}
    scores={scores} change={vi.fn()} {...shared} />));
  const fields = ".row-date-label, .badge.confirmed, .place, .priority-chip, .stage-picker, .going-button, .apply-cta";
  for (const $ of [grid, rows, pipeline]) {
    const record = $("[data-event-id]");
    expect(record.find(fields).map((_, el) => $(el).attr("class")?.split(" ")[0]).get())
      .toEqual(["row-date-label", "badge", "place", "priority-chip", "stage-picker", "going-button", "button"]);
    expect(record.find(".row-date-label").text()).toBe("3–5 Jan 2027");
  }
  expect(grid(".card-option-scanner").text()).toBe(rows(".row-scanner").text());
  expect(grid(".card-option-source").text()).toBe(rows(".row-source").text());
});
