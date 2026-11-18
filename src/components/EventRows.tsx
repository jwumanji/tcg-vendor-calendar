import { useMemo, useState, useRef, type KeyboardEvent } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import type { Event } from "../model";
import type { ScoreResult } from "../scoring";
import { emptyEntry, type Entries } from "../storage";
import { games, gameKey } from "../utils";
import {
  ROW_SORT_LABELS,
  nextRowSort,
  rowDateLabel,
  sortRows,
  selectAllVisible,
  selectRange,
  type RowKey,
  type RowSort,
} from "../rows";
import { Logo, Place, NoteTag, ScoreGem, Status } from "./EventIdentity";
import { GoingButton, type SetGoing } from "./GoingButton";
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
  selectMode,
  setGoing,
  open,
}: {
  events: Event[];
  sort: RowSort;
  setSort: (sort: RowSort) => void;
  entries: Entries;
  scores: Record<string, ScoreResult>;
  today: string;
  selectMode: boolean;
  setGoing: SetGoing;
  open: (e: Event) => void;
}) {
  const sorted = useMemo(
    () => sortRows(events, sort, entries, scores, today),
    [events, sort, entries, scores, today],
  );
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const anchor = useRef<string | null>(null);
  const ids = useMemo(() => sorted.map((e) => e.id), [sorted]);
  const visibleSelection = ids.filter((id) => selected.has(id));
  const count = visibleSelection.length;
  const all = count > 0 && count === ids.length;
  function select(id: string, shift: boolean) {
    const start = shift ? anchor.current : null;
    setSelected((current) => selectRange(ids, current, id, start));
    if (!shift || !ids.includes(anchor.current || "")) anchor.current = id;
  }
  function selectAll(checked: boolean) {
    setSelected(selectAllVisible(ids, checked));
    anchor.current = null;
  }
  function apply(going: boolean) {
    setGoing(visibleSelection, going);
    selectAll(false);
  }
  function selectAllCheckbox() {
    return (
      <label className="select-all">
        <input
          type="checkbox"
          aria-label="Select all visible"
          checked={all}
          ref={(input) => {
            if (input) input.indeterminate = count > 0 && !all;
          }}
          onChange={(ev) => selectAll(ev.target.checked)}
        />
        <span>Select all visible</span>
      </label>
    );
  }
  function header(key: RowKey) {
    const active = sort.key === key;
    const Icon = !active
      ? ChevronsUpDown
      : sort.direction === "asc"
        ? ArrowUp
        : ArrowDown;
    return (
      <th
        role="columnheader"
        className={`col-${key}`}
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
      destination
        ?.querySelector<HTMLButtonElement>(
          ev.target.closest(".going-button") ? ".going-button" : ".row-name",
        )
        ?.focus();
    }
  }
  return (
    <>
      <span role="status" aria-live="polite" className="sr-only">
        {selectMode ? `${count} events selected` : ""}
      </span>
      {selectMode && (
        <div className="bulk-bar" role="group" aria-label="Bulk selection">
          {selectAllCheckbox()}
          <strong>{count} selected</strong>
          {count > 0 && (
            <>
              <button className="button primary" onClick={() => apply(true)}>
                Mark Going
              </button>
              <button className="button" onClick={() => apply(false)}>
                Unmark Going
              </button>
              <button className="button" onClick={() => selectAll(false)}>
                Clear selection
              </button>
            </>
          )}
        </div>
      )}
      <div className="rows-wrap">
        <table className="event-rows" data-selecting={selectMode} role="table">
          <caption className="sr-only">
            Event opportunities. Sort by column. Use the arrow keys, Home or End
            on event names to move between rows.
          </caption>
          <thead role="rowgroup">
            <tr role="row">
              {header("going")}
              {selectMode && (
                <th className="col-select" scope="col">
                  {selectAllCheckbox()}
                </th>
              )}
              {header("name")}
              {header("dates")}
              {header("city")}
              <th scope="col" role="columnheader" className="col-games">
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
                  data-going={entry.going}
                  data-selected={selectMode && selected.has(e.id)}
                  onKeyDown={navigate}
                  onClick={(ev) => {
                    if ((ev.target as Element).closest("a,button,input,label"))
                      return;
                    ev.currentTarget
                      .querySelector<HTMLButtonElement>(".row-name")
                      ?.focus({ preventScroll: true });
                    if (selectMode) select(e.id, ev.shiftKey);
                    else open(e);
                  }}
                >
                  <td role="cell" className="row-going">
                    <GoingButton
                      e={e}
                      going={entry.going}
                      setGoing={setGoing}
                      compact
                    />
                  </td>
                  {selectMode && (
                    <td role="cell" className="row-select">
                      <label>
                        <input
                          type="checkbox"
                          aria-label={`Select ${e.name}`}
                          checked={selected.has(e.id)}
                          onChange={(ev) =>
                            select(
                              e.id,
                              (ev.nativeEvent as MouseEvent).shiftKey,
                            )
                          }
                        />
                      </label>
                    </td>
                  )}
                  <td role="cell" className="row-identity">
                    <div>
                      <Logo e={e} size="row" />
                      <div>
                        <button
                          className="row-name"
                          aria-pressed={
                            selectMode ? selected.has(e.id) : undefined
                          }
                          onClick={(ev) =>
                            selectMode ? select(e.id, ev.shiftKey) : open(e)
                          }
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
                    <Place e={e} stacked />
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

export function MobileRowSort({
  sort,
  setSort,
}: {
  sort: RowSort;
  setSort: (sort: RowSort) => void;
}) {
  const Direction = sort.direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <div className="row-sort-mobile">
      <label>
        <span className="sr-only">Sort rows by</span>
        <select
          value={sort.key}
          onChange={(ev) =>
            setSort(nextRowSort(sort, ev.target.value as RowKey))
          }
        >
          {Object.entries(ROW_SORT_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
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
      </button>
    </div>
  );
}
