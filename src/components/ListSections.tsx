import type { ReactNode } from "react";
import type { Event } from "../model";
import type { RowKey } from "../rows";
import { monthLabel } from "../utils";
import { Place } from "./EventIdentity";

export function SectionHeading({
  groupKey, sortKey, items,
}: {
  groupKey: string;
  sortKey: RowKey;
  items: Event[];
}) {
  return (
    <h3 className="list-section-heading">
      {sortKey === "country" ? (
        <Place e={items.find((e) => e.country_code) ?? items[0]} countryOnly />
      ) : groupKey === "tba" ? "Dates not announced" : monthLabel(groupKey)}
      <span className="section-count"> · {items.length} {items.length === 1 ? "event" : "events"}</span>
    </h3>
  );
}

export function CardSections({
  groups, sortKey, children,
}: {
  groups: ReadonlyMap<string, Event[]>;
  sortKey: RowKey;
  children: (event: Event, titleLevel: 3 | 4) => ReactNode;
}) {
  return Array.from(groups, ([key, items]) =>
    key ? (
      <section className="card-section" key={key}>
        <SectionHeading groupKey={key} sortKey={sortKey} items={items} />
        <div className="cards list-cards">{items.map((e) => children(e, 4))}</div>
      </section>
    ) : (
      <div className="cards list-cards" key={key}>{items.map((e) => children(e, 3))}</div>
    ),
  );
}
