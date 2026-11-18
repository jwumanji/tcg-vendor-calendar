import { useMemo, type KeyboardEvent } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import type { Event } from "../model";
import type { ScoreResult } from "../scoring";
import { emptyEntry, type Entries } from "../storage";
import { flag, games, gameKey } from "../utils";
import {
  ROW_SORT_LABELS,
  nextRowSort,
  rowDateLabel,
  sortRows,
  type RowKey,
  type RowSort,
} from "../rows";
import { Logo, NoteTag, ScoreGem, Status } from "./EventIdentity";
import { StageBadge } from "./Pipeline";
import { PriorityChip } from "./PriorityChip";
import { SourceChip } from "./FindSource";

export function EventRows({
  events,
  sort,
  setSort,
  entries,
  scores,
  today,
  open,
}: {
  events: Event[];
  sort: RowSort;
  setSort: (sort: RowSort) => void;
  entries: Entries;
  scores: Record<string, ScoreResult>;
  today: string;
  open: (e: Event) => void;
}) {
  const sorted = useMemo(
    () => sortRows(events, sort, entries, scores, today),
    [events, sort, entries, scores, today],
  );
  const Direction = sort.direction === "asc" ? ArrowUp : ArrowDown;
  function header(key: RowKey) {
    const active = sort.key === key;
    const Icon = active ? Direction : ChevronsUpDown;
    return (
      <th
        role="columnheader"
        scope="col"
        aria-sort={
          active
            ? sort.direction === "asc"
              ? "ascending"
              : "descending"
            : undefined
        }
      >
        <span className="row-mobile-header">{ROW_SORT_LABELS[key]}</span>
        <button onClick={() => setSort(nextRowSort(sort, key))}>
          {ROW_SORT_LABELS[key]}
          <Icon size={12} aria-hidden="true" />
        </button>
      </th>
    );
  }
  function navigate(ev: KeyboardEvent<HTMLTableRowElement>) {
    if (!(ev.target instanceof HTMLButtonElement)) return;
    const tr = ev.currentTarget;
    const destination = {
      ArrowUp: tr.previousElementSibling,
      ArrowDown: tr.nextElementSibling,
      Home: tr.parentElement?.firstElementChild,
      End: tr.parentElement?.lastElementChild,
    }[ev.key];
    if (destination !== undefined) {
      ev.preventDefault();
      destination?.querySelector("button")?.focus();
    }
  }
  return (
    <>
      <div className="row-sort-mobile">
        <label>
          Sort by{" "}
          <select
            value={sort.key}
            onChange={(ev) =>
              setSort(nextRowSort(sort, ev.target.value as RowKey))
            }
          >
            {Object.entries(ROW_SORT_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {key === "priority" ? "Priority score" : label}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button"
          onClick={() => setSort(nextRowSort(sort, sort.key))}
          aria-label={`Sort ${sort.direction === "asc" ? "descending" : "ascending"}`}
        >
          <Direction size={15} />
          {sort.direction === "asc" ? "Ascending" : "Descending"}
        </button>
      </div>
      <div className="rows-wrap">
        <table className="event-rows" role="table">
          <caption className="sr-only">
            Event opportunities. Sort by column. Use the arrow keys, Home or End
            on event names to move between rows.
          </caption>
          <thead role="rowgroup">
            <tr role="row">
              {header("name")}
              {header("dates")}
              {header("city")}
              <th scope="col" role="columnheader">
                Games
              </th>
              {header("status")}
              {header("priority")}
              {header("scanner")}
              {header("stage")}
              {header("notes")}
              {header("source")}
            </tr>
          </thead>
          <tbody role="rowgroup">
            {sorted.map((e) => {
              const entry = entries[e.id] || emptyEntry;
              const titles = games(e);
              const dates = rowDateLabel(e, today);
              return (
                <tr
                  key={e.id}
                  role="row"
                  onKeyDown={navigate}
                  onClick={(ev) => {
                    if ((ev.target as Element).closest("a,button")) return;
                    ev.currentTarget
                      .querySelector("button")
                      ?.focus({ preventScroll: true });
                    open(e);
                  }}
                >
                  <td role="cell" className="row-identity">
                    <div>
                      <Logo e={e} />
                      <div>
                        <button
                          className="row-name"
                          onClick={() => open(e)}
                          title={e.name}
                        >
                          {e.name}
                        </button>
                        {e.organizer && (
                          <small title={e.organizer}>{e.organizer}</small>
                        )}
                      </div>
                    </div>
                  </td>
                  <td role="cell" className="row-dates" title={dates}>
                    {dates}
                  </td>
                  <td role="cell" className="row-place">
                    <span aria-hidden="true">{flag(e.country_code)} </span>
                    {e.city || e.country || "TBA"}
                    {e.city && e.country && <small>{e.country}</small>}
                  </td>
                  <td role="cell" className="row-games">
                    <div>
                      {titles.slice(0, 2).map((g) => (
                        <span
                          key={g}
                          className="game-tag"
                          data-game={gameKey(g)}
                        >
                          {g}
                        </span>
                      ))}
                      {titles.length > 2 && (
                        <span title={titles.slice(2).join(", ")}>
                          +{titles.length - 2}
                        </span>
                      )}
                    </div>
                  </td>
                  <td role="cell" className="row-status">
                    <Status e={e} />
                  </td>
                  <td role="cell" className="row-priority">
                    <PriorityChip result={scores[e.id]} />
                  </td>
                  <td role="cell" className="row-scanner">
                    {e.vendor_score === null ? (
                      "—"
                    ) : (
                      <ScoreGem score={e.vendor_score} />
                    )}
                  </td>
                  <td role="cell" className="row-stage" title={entry.stage}>
                    <StageBadge stage={entry.stage} />
                  </td>
                  <td role="cell" className="row-notes">
                    {entry.note.trim() ? (
                      <NoteTag compact />
                    ) : (
                      <span className="sr-only">No notes</span>
                    )}
                  </td>
                  <td role="cell" className="row-source">
                    <SourceChip e={e} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
