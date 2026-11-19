import { load } from "cheerio";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import fixtures from "../../tests/fixtures/new-finds.json";
import { mergeOutreach, normalizeEvents } from "../data";
import { defaultRowSort, groupSortedRows, listCardDate, sortRows, type OptionalColumn, type RowSort } from "../rows";
import { scoreEvents } from "../scoring";
import { emptyEntry } from "../storage";
import { Detail } from "./Detail";
import { EventCard } from "./EventCard";
import { EventRows } from "./EventRows";
import { CardSections } from "./ListSections";
import { Pipeline } from "./Pipeline";
import { TopPicks } from "./TopPicks";

const today = "2026-11-18";
const [harbour, kowloon, pasar] = normalizeEvents(fixtures);
const event = { ...harbour, vendor_score: 51 };
const events = [event, kowloon, pasar, { ...pasar, id: "estimate", estimated_month: "2027-01" }];
const scores = Object.fromEntries(scoreEvents(events, { today }).map((score) => [score.id, score]));
const shared = { entries: {}, open: vi.fn(), setGoing: vi.fn() };

function layouts(sort: RowSort, columns: OptionalColumn[] = [], list = events) {
  const sorted = sortRows(list, sort, {}, scores, today);
  const groups = groupSortedRows(sorted, sort.key, today);
  const grid = (
    <CardSections groups={groups} sortKey={sort.key}>
      {(e, titleLevel) => (
        <EventCard key={e.id} e={e} entry={emptyEntry} score={scores[e.id]}
          occurrence={listCardDate(e, today)} titleLevel={titleLevel} {...shared} />
      )}
    </CardSections>
  );
  const rows = (
    <EventRows groups={groups} sort={sort} setSort={vi.fn()} columns={columns}
      today={today} scores={scores} selectMode={false} {...shared} />
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
  const pipeline = <Pipeline events={[event]} scores={scores} change={vi.fn()} {...shared} />;
  const picks = <TopPicks events={[event]} scores={scores} today={today} visible={() => true} {...shared} />;
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
    expect(chips.map((_, el) => $(el).text()).get()).toEqual(["Contacted · Email", "Replied · Form", "Quoted"]);
    expect($(".priority-chip")).toHaveLength(list.length);
  }
  expect(rows(".row-outreach")).toHaveLength(0);
  const { rows: withColumn } = layouts(sort, ["outreach"], list);
  expect(withColumn(".col-outreach").attr("aria-sort")).toBe("ascending");
  expect(withColumn(".row-outreach .outreach-chip")).toHaveLength(3);
  expect(withColumn(".row-markers .outreach-chip")).toHaveLength(0);
});

it("labels the event outreach section, editor, research links and prices independently of pipeline", () => {
  const outreach = mergeOutreach(null, {
    contact_type: "form", contact: "https://example.com/apply",
    published_booth_price: "$200", price_source_url: "https://example.com/prices",
  });
  const $ = load(renderToStaticMarkup(
    <Detail e={{ ...event, outreach }} knownOutreach={outreach} entry={emptyEntry}
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
    <Detail e={event} entry={emptyEntry} score={scores[event.id]} saved setGoing={shared.setGoing}
      onStage={vi.fn()} onNote={vi.fn()} onOutreach={vi.fn()} setOverride={vi.fn()} openClash={vi.fn()} toast={null} />,
  ));
  const factor = $(".priority-detail details").filter((_, el) => $(el).find("summary").text().includes("Scanner score"));
  expect(factor).toHaveLength(1);
  expect(factor.text()).toContain("Scanner vendor score 51/100");
  expect($("meter, .vendor-meter, .gem")).toHaveLength(0);
});
