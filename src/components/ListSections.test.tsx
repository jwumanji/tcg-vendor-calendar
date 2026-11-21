import { load } from "cheerio";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import fixtures from "../../tests/fixtures/new-finds.json";
import { mergeOutreach, normalizeEvents } from "../data";
import { defaultRowSort, groupSortedRows, orderTimelineGroups, sortRows, type OptionalColumn, type RowSort } from "../rows";
import { scoreEvents } from "../scoring";
import { emptyFilters } from "../model";
import { ics, matches, matchingEvent, timelineGroups } from "../utils";
import { emptyEntry } from "../storage";
import { Detail } from "./Detail";
import { EventCard } from "./EventCard";
import { EventRows } from "./EventRows";
import { CardSections } from "./ListSections";
import { CalendarView } from "./CalendarView";
import { Pipeline } from "./Pipeline";
import { TopPicks } from "./TopPicks";

const today = "2026-11-18";
const [harbour, kowloon, pasar] = normalizeEvents(fixtures);
const event = { ...harbour, vendor_score: 51 };
const events = [event, kowloon, pasar, { ...pasar, id: "estimate", estimated_month: "2027-01" }];
const scores = Object.fromEntries(scoreEvents(events, { today }).map((score) => [score.id, score]));
const shared = { entries: {}, open: vi.fn(), setGoing: vi.fn() };

function layouts(sort: RowSort, columns: OptionalColumn[] = [], list = events, results = scores) {
  const sorted = sortRows(list, sort, {}, results, today);
  const groups = groupSortedRows(sorted, sort.key, today);
  const grid = (
    <CardSections groups={groups} sortKey={sort.key}>
      {(e, titleLevel) => (
        <EventCard key={e.id} e={e} entry={emptyEntry} score={results[e.id]}
          today={today} titleLevel={titleLevel} {...shared} />
      )}
    </CardSections>
  );
  const rows = (
    <EventRows groups={groups} sort={sort} setSort={vi.fn()} columns={columns}
      today={today} scores={results} selectMode={false} {...shared} />
  );
  return { grid: load(renderToStaticMarkup(grid)), rows: load(renderToStaticMarkup(rows)) };
}

describe("Grid and Rows sections", () => {
  it.each<[RowSort, string[]]>([
    [defaultRowSort, ["January 2027 · 2 events", "March 2027 · 1 event", "Date TBA · 1 event"]],
    [{ key: "dates", direction: "desc" }, ["March 2027 · 1 event", "January 2027 · 2 events", "Date TBA · 1 event"]],
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
    expect(grid(".card-when").map((_, el) => grid(el).text()).get())
      .toEqual(["31 Jan 2027 – 1 Feb 2027", "Est. January 2027"]);
    expect(grid(".event-card").last().find(".badge.tba").text()).toContain("TBA");
    expect(rows(".row-dates").first().text()).toBe("Confirmed 31 Jan–1 Feb 2027");
    expect(rows(".row-dates[data-status=tba]").text()).toBe("Est. Jan 2027");
  });
});

it("shows only priority chips on list cards, rows, pipeline cards and top picks", () => {
  const { grid, rows } = layouts(defaultRowSort);
  const pipeline = <Pipeline today={today} sort={defaultRowSort} events={[event]} scores={scores} change={vi.fn()} {...shared} />;
  const picks = <TopPicks events={[event]} scores={scores} today={today} {...shared} />;
  for (const $ of [grid, rows, load(renderToStaticMarkup(pipeline)), load(renderToStaticMarkup(picks))]) {
    expect($(".priority-chip").length).toBeGreaterThan(0);
    expect($(".gem, .gem-tier, [data-tier], [title^='Scanner score']")).toHaveLength(0);
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
  const { rows: withColumn } = layouts(sort, ["outreach"], list);
  expect(withColumn(".col-outreach").attr("aria-sort")).toBe("ascending");
  expect(withColumn(".row-outreach .outreach-chip")).toHaveLength(3);
  expect(withColumn(".row-markers .outreach-chip")).toHaveLength(0);
});

it.each([
  ["sales@example.com", null, "mailto:sales@example.com", "Email · sales@example.com"],
  ["Use the official form", "https://example.com/contact", "https://example.com/contact", "https://example.com/contact"],
])("uses a direct event route for %s when no outreach route is seeded", (contact, vendor_application, href, label) => {
  const $ = load(renderToStaticMarkup(
    <Detail today={today} e={{ ...event, contact, vendor_application }} entry={emptyEntry}
      score={scores[event.id]} saved setGoing={shared.setGoing}
      onStage={vi.fn()} onNote={vi.fn()} onOutreach={vi.fn()} setOverride={vi.fn()} openClash={vi.fn()} toast={null} />,
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
      onStage={vi.fn()} onNote={vi.fn()} onOutreach={vi.fn()} setOverride={vi.fn()} openClash={vi.fn()} toast={null} />,
  ));
  const section = $("section[aria-labelledby='outreach-heading']");
  expect($("#outreach-heading").text()).toBe("Outreach");
  expect(section.find("dt").map((_, el) => $(el).text()).get()).toEqual(["Known contact route", "Published booth price"]);
  expect(section.find("a").map((_, el) => $(el).attr("href")).get()).toEqual(["https://example.com/apply", "https://example.com/prices"]);
  expect(section.text()).toContain("$200");
  expect(section.find("label").map((_, el) => $(el).contents().first().text()).get()).toEqual([
    "Outreach status", "Outreach method", "Contact address or URL", "Contacted on",
    "Response date", "Quoted price", "Outreach notes",
  ]);
  expect(section.find("button").text()).toBe("Save outreach");
  expect($(".event-facts .outreach-chip").text()).toBe("Outreach: Not contacted");
  expect($("label[for=detail-stage]").text()).toBe("PIPELINE STAGE");
});

it("keeps the scanner value in the event page priority breakdown", () => {
  const $ = load(renderToStaticMarkup(
    <Detail today={today} e={event} entry={emptyEntry} score={scores[event.id]} saved setGoing={shared.setGoing}
      onStage={vi.fn()} onNote={vi.fn()} onOutreach={vi.fn()} setOverride={vi.fn()} openClash={vi.fn()} toast={null} />,
  ));
  const factor = $(".priority-detail details").filter((_, el) => $(el).find("summary").text().includes("Scanner score"));
  expect(factor).toHaveLength(1);
  expect(factor.text()).toContain("Scanner vendor score 51/100");
  expect($("meter, .vendor-meter, .gem")).toHaveLength(0);
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
  expect(cell.text()).toMatch(/^Cancelled /);
  expect(cell.text()).not.toContain("Confirmed");
  expect(matches(cancelled, { ...emptyFilters, status: "cancelled" }, {})).toBe(true);
  expect(matches(cancelled, { ...emptyFilters, status: "confirmed" }, {})).toBe(false);
});

it("identifies a hidden sort column and direction in Rows", () => {
  const { rows } = layouts({ key: "scanner", direction: "desc" });
  expect(rows(".rows-sort-note").text()).toBe("Sorted by Scanner score (descending)");
  expect(layouts({ key: "scanner", direction: "desc" }, ["scanner"]).rows(".rows-sort-note")).toHaveLength(0);
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
  expect(pipeline(".pcard-tags .badge.cancelled")).toHaveLength(1);
  expect(pipeline(".pcard-tags .badge.postponed")).toHaveLength(1);
  const detail = load(renderToStaticMarkup(<Detail today={today} e={cancelled} score={results[cancelled.id]} entry={emptyEntry}
    saved setGoing={shared.setGoing} onStage={vi.fn()} onNote={vi.fn()} onOutreach={vi.fn()}
    setOverride={vi.fn()} openClash={vi.fn()} toast={null} />));
  expect(detail(".badge.cancelled").text()).toBe("Cancelled");
  expect(detail(".note").text()).toContain(cancelled.date_note);
  expect(detail(".override-form, .clash-note")).toHaveLength(0);
});

it("orders Rows, Pipeline columns and Timeline stage groups by the same descending stage selection", () => {
  const sort: RowSort = { key: "stage", direction: "desc" };
  const entries = { [kowloon.id]: { ...emptyEntry, stage: "Contacted" as const } };
  const sorted = sortRows([event, kowloon], sort, entries, scores, today);
  const groups = groupSortedRows(sorted, sort.key, today);
  const rows = load(renderToStaticMarkup(<EventRows groups={groups} sort={sort} setSort={vi.fn()} columns={[]}
    today={today} scores={scores} selectMode={false} {...shared} entries={entries} />));
  const pipeline = load(renderToStaticMarkup(<Pipeline today={today} sort={sort} events={sorted} scores={scores}
    change={vi.fn()} {...shared} entries={entries} />));
  expect(rows(".row-name").map((_, el) => rows(el).text()).get()).toEqual([kowloon.name, event.name]);
  expect(pipeline(".pcard-title button").map((_, el) => pipeline(el).contents().first().text()).get())
    .toEqual([kowloon.name, event.name]);
  const timeline = orderTimelineGroups(timelineGroups(sorted, emptyFilters, entries, true), true, sort);
  expect(timeline.map(([stage]) => stage)).toEqual(["Contacted", "New"]);
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
    expect(text).toContain("13 Feb 2027 – 14 Feb 2027");
    expect(text).not.toContain("Jan");
  }
});
