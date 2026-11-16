import type { Event } from '../model';
import type { Entry } from '../storage';
import { games, flag, dateLabel } from '../utils';
import { Logo, Status } from './EventIdentity';
import { StageBadge } from './Pipeline';
export function EventCard({ e, entry, occurrence, open }: { e: Event; entry: Entry; occurrence?: string; open: () => void }) {
  return (
      <button
        className="event-card"
        
        onClick={open}
      >
        <div className="card-top">
          <Logo e={e} />
          <span className="card-title">{e.name}</span>
          {e.vendor_score !== null && (
            <span className="score">
              {e.vendor_score}
              <small>/100</small>
            </span>
          )}
        </div>
        <div className="card-location">
          {flag(e.country_code)}{" "}
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
      </button>
  );
}
