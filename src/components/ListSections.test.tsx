import { load } from "cheerio";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import fixtures from "../../tests/fixtures/new-finds.json";
import { normalizeEvents } from "../data";
import { defaultRowSort, groupSortedRows, sortRows, type RowSort } from "../rows";
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

function layouts(sort: RowSort, scanner = false) {
  const sorted = sortRows(events, sort, {}, scores, today);
  const groups = groupSortedRows(sorted, sort.key, today);
  const grid = (
    <CardSections groups={groups} sortKey={sort.key}>
      {(e) => <EventCard key={e.id} e={e} entry={emptyEntry} score={scores[e.id]} {...shared} />}
    </CardSections>
  );
  const rows = (
    <EventRows groups={groups} sort={sort} setSort={vi.fn()} columns={scanner ? ["scanner"] : []}
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
    expect(rows("th[scope=rowgroup] h3")).toHaveLength(expected.length);
    expect(grid(".cards .card-title button").map((_, el) => grid(el).contents().first().text()).get())
      .toEqual(rows(".row-name").map((_, el) => rows(el).contents().first().text()).get());
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
  const { rows: optedIn } = layouts(defaultRowSort, true);
  expect(optedIn(".row-scanner").first().contents().last().text()).toBe("51");
  expect(optedIn(".gem")).toHaveLength(0);
});

it("keeps the scanner value in the event page priority breakdown", () => {
  const $ = load(renderToStaticMarkup(
    <Detail e={event} entry={emptyEntry} score={scores[event.id]} saved setGoing={shared.setGoing}
      onStage={vi.fn()} onNote={vi.fn()} setOverride={vi.fn()} openClash={vi.fn()} toast={null} />,
  ));
  const factor = $(".priority-detail details").filter((_, el) => $(el).find("summary").text().includes("Scanner score"));
  expect(factor).toHaveLength(1);
  expect(factor.text()).toContain("Scanner vendor score 51/100");
  expect($("meter, .vendor-meter, .gem")).toHaveLength(0);
});
