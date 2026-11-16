import { memo } from "react";
import type { Event } from "../model";
import type { Entry } from "../storage";
import { games, dateLabel } from "../utils";
import { Logo, Status, CountryFlag } from "./EventIdentity";
import { StageBadge } from "./Pipeline";
export const EventCard = memo(function EventCard({
  e,
  entry,
  occurrence,
  open,
}: {
  e: Event;
  entry: Entry;
  occurrence?: string;
  open: (e: Event) => void;
}) {
  return (
    <article className="event-card">
      <div className="card-top">
        <Logo e={e} />
        <h3 className="card-title">
          <button className="stretched-button" onClick={() => open(e)}>
            {e.name}
            <span className="sr-only">
              {" "}
              · {occurrence || dateLabel(e)} · {entry.stage}
            </span>
          </button>
        </h3>
        {e.vendor_score !== null && (
          <span className="score">
            {e.vendor_score}
            <small>/100</small>
          </span>
        )}
      </div>
      <div className="card-location">
        <CountryFlag code={e.country_code} />{" "}
        {[e.city, e.country].filter(Boolean).join(", ") || "Location TBA"}
      </div>
      <div className="card-bottom">
        <span>{occurrence || dateLabel(e)}</span>
        <Status e={e} />
      </div>
      <div className="card-tags">
        {games(e)
          .slice(0, 3)
          .map((g) => (
            <span key={g}>{g}</span>
          ))}
        <StageBadge stage={entry.stage} />
        {entry.note.trim() && <span title="Has notes">📝 Notes</span>}
      </div>
    </article>
  );
});
