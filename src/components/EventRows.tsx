import { Fragment, useMemo, useState, useRef, type KeyboardEvent } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, X, Columns3 } from "lucide-react";
import type { Event } from "../model";
import type { ScoreResult } from "../scoring";
import { emptyEntry, type Entries } from "../storage";
import { games, gameKey, upcoming } from "../utils";
import {
  ROW_SORT_LABELS,
  optionalColumns,
  type OptionalColumn,
  nextRowSort,
  rowDateLabel,
  selectAllVisible,
  selectRange,
  type RowKey,
  type RowSort,
} from "../rows";
import { Logo, Place, NoteTag, ClashCue } from "./EventIdentity";
import { GoingButton, type SetGoing } from "./GoingButton";
import { StageBadge } from "./Pipeline";
import { PriorityChip } from "./PriorityChip";
import { SectionHeading } from "./ListSections";
import { SourceChip } from "./FindSource";

export function EventRows({
  groups,
  columns,
  sort,
  setSort,
  entries,
  scores,
  today,
  selectMode,
  setGoing,
  open,
}: {
  groups: ReadonlyMap<string, Event[]>;
  columns: OptionalColumn[];
  sort: RowSort;
  setSort: (sort: RowSort) => void;
  entries: Entries;
  scores: Record<string, ScoreResult>;
  today: string;
  selectMode: boolean;
  setGoing: SetGoing;
  open: (e: Event) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const anchor = useRef<string | null>(null);
  const ids = useMemo(
    () => Array.from(groups.values()).flatMap((items) => items.map((e) => e.id)),
    [groups],
  );
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
  function navigate(ev: KeyboardEvent<HTMLTableRowElement>, e: Event) {
    if (
      !(ev.target instanceof HTMLButtonElement) ||
      ev.altKey ||
      ev.metaKey ||
      ev.ctrlKey
    )
      return;
    const name = ev.target.classList.contains("row-name");
    if ((name && ev.key === " ") || ev.key.toLowerCase() === "g") {
      ev.preventDefault();
      if (!ev.repeat) setGoing([e.id], !entries[e.id]?.going);
      return;
    }
    const index = ids.indexOf(e.id);
    const target = {
      ArrowUp: index - 1,
      ArrowDown: index + 1,
      Home: 0,
      End: ids.length - 1,
    }[ev.key];
    if (target === undefined) return;
    ev.preventDefault();
    const buttons = ev.currentTarget
      .closest("table")
      ?.querySelectorAll<HTMLButtonElement>(
        name ? ".row-name" : ".going-button",
      );
    buttons?.[target]?.focus();
  }
  return (
    <>
      <span role="status" aria-live="polite" className="sr-only">
        {selectMode ? `${count} events selected` : ""}
      </span>
      {selectMode && (
        <div className="bulk-bar" role="group" aria-label="Bulk selection">
          <strong>{count} selected</strong>

          <button
            className="button primary"
            disabled={!count}
            onClick={() => apply(true)}
          >
            Mark Going
          </button>
          <button
            className="button"
            disabled={!count}
            onClick={() => apply(false)}
          >
            Unmark
          </button>
          <button
            className="button"
            aria-label="Clear selection"
            disabled={!count}
            onClick={() => selectAll(false)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {selectMode && (
        <div className="mobile-select-all">{selectAllCheckbox()}</div>
      )}
      <div className="rows-wrap">
        {/* Mobile rows use CSS grid and block cells. Explicit native roles retain
            the table structure in WebKit. Each heading exposes one label per layout. */}
        <table className="event-rows" data-selecting={selectMode} role="table">
          <caption className="sr-only">
            Event opportunities. Sort by column. Use the arrow keys, Home or End
            on event names to move between rows. Enter opens or selects. Space
            or G toggles Going.
          </caption>
          <thead role="rowgroup">
            <tr role="row">
              {!selectMode && header("going")}
              {selectMode && (
                <th role="columnheader" className="col-select" scope="col">
                  {selectAllCheckbox()}
                </th>
              )}
              {header("name")}
              {header("dates")}
              {header("country")}
              <th scope="col" role="columnheader" className="col-games">
                Games
              </th>
              {header("priority")}
              {header("stage")}
              {columns.map((key) => (
                <Fragment key={key}>{header(key)}</Fragment>
              ))}
            </tr>
          </thead>
          {Array.from(groups, ([key, items]) => (
            <tbody key={key} role="rowgroup">
              {key && (
                <tr role="row" className="month-divider">
                  <th scope="rowgroup" colSpan={7 + columns.length}>
                    <SectionHeading groupKey={key} sortKey={sort.key} items={items} />
                  </th>
                </tr>
              )}
              {items.map((e) => {
                const entry = entries[e.id] || emptyEntry;
                const titles = games(e);
                const past = !upcoming(e, today);
                const dates = rowDateLabel(e, today);
                return (
                  <tr
                    key={e.id}
                    role="row"
                    data-going={entry.going}
                    data-selected={selectMode && selected.has(e.id)}
                    data-past={past}
                    onKeyDown={(ev) => navigate(ev, e)}
                    onClick={(ev) => {
                      if (
                        (ev.target as Element).closest("a,button,input,label")
                      )
                        return;
                      ev.currentTarget
                        .querySelector<HTMLButtonElement>(".row-name")
                        ?.focus({ preventScroll: true });
                      if (selectMode) select(e.id, ev.shiftKey);
                      else open(e);
                    }}
                  >
                    {!selectMode && (
                      <td role="cell" className="row-going">
                        <GoingButton
                          e={e}
                          going={entry.going}
                          setGoing={setGoing}
                          compact
                        />
                      </td>
                    )}
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
                          <div className="row-markers">
                            {selectMode && entry.going && (
                              <span className="going-marker">Going</span>
                            )}
                            {e.is_new_find && (
                              <span className="source-chip new-find">
                                New find
                              </span>
                            )}
                            {entry.note.trim() && <NoteTag compact />}
                            {past && <span>Past</span>}
                            <ClashCue score={scores[e.id]} entries={entries} />
                          </div>
                        </div>
                      </div>
                    </td>
                    <td
                      role="cell"
                      className="row-dates"
                      data-status={dates === "TBA" ? "tba" : e.date_status}
                      title={e.date_status + " · " + dates}
                    >
                      <i aria-hidden="true" />
                      {e.date_status === "confirmed" && (
                        <span className="sr-only">Confirmed </span>
                      )}
                      {dates}
                    </td>
                    <td role="cell" className="row-place">
                      <Place e={e} cityOnly />
                    </td>
                    <td role="cell" className="row-games">
                      <div>
                        {titles.slice(0, 2).map((g) => (
                          <span
                            key={g}
                            className="game-tag"
                            title={g}
                            data-game={gameKey(g)}
                          >
                            <span>{g}</span>
                          </span>
                        ))}
                        {titles.length > 2 && (
                          <span title={titles.slice(2).join(", ")}>
                            +{titles.length - 2}
                          </span>
                        )}
                      </div>
                    </td>
                    <td role="cell" className="row-priority">
                      <PriorityChip result={scores[e.id]} />
                    </td>
                    <td role="cell" className="row-stage">
                      {entry.stage !== "New" && (
                        <StageBadge stage={entry.stage} />
                      )}
                    </td>
                    {columns.includes("scanner") && (
                      <td role="cell" className="row-scanner">
                        <span className="row-mobile-header" aria-hidden="true">Scanner score · </span>
                        {e.vendor_score ?? "—"}
                      </td>
                    )}
                    {columns.includes("source") && (
                      <td role="cell" className="row-source">
                        <SourceChip e={e} link={!selectMode} />
                      </td>
                    )}
                    {columns.includes("notes") && (
                      <td role="cell" className="row-notes" title={entry.note}>
                        {entry.note || "—"}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>
    </>
  );
}

export function RowColumns({
  columns,
  change,
}: {
  columns: OptionalColumn[];
  change: (columns: OptionalColumn[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <div
      className="column-control"
      onBlur={(ev) => {
        if (!ev.currentTarget.contains(ev.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(ev) => {
        if (ev.key === "Escape") {
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        className="button"
        ref={trigger}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Columns3 size={15} /> Columns
      </button>
      {open && (
        <fieldset className="columns-panel">
          <legend className="sr-only">Optional columns</legend>
          {optionalColumns.map((key) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={columns.includes(key)}
                onChange={() =>
                  change(
                    optionalColumns.filter((k) =>
                      k === key ? !columns.includes(key) : columns.includes(k),
                    ),
                  )
                }
              />
              {ROW_SORT_LABELS[key]}
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}
export function RowSortControl({
  sort,
  setSort,
}: {
  sort: RowSort;
  setSort: (sort: RowSort) => void;
}) {
  const Direction = sort.direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <div className="row-sort-control">
      <div role="group" aria-label="Quick sort" className="quick-sort">
        {(["priority", "dates"] as const).map((key) => (
          <button
            key={key}
            aria-pressed={sort.key === key}
            onClick={() =>
              setSort({ key, direction: key === "priority" ? "desc" : "asc" })
            }
          >
            {key === "priority" ? "Priority" : "Date"}
          </button>
        ))}
      </div>
      <label>
        <span className="sr-only">Sort events by</span>
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
