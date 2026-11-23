import { useId, useState, useRef, type KeyboardEvent } from "react";
import { ArrowDown, ArrowUp, Columns3 } from "lucide-react";
import type { Event } from "../model";
import type { ScoreResult } from "../scoring";
import { emptyEntry, type DisplayEntry, type Stage } from "../storage";
import { vendorApplyAction } from "../eventDecision";
import { displayDateLabel, scheduleStatus, upcoming } from "../utils";
import {
  ROW_SORT_LABELS,
  optionalColumns,
  type OptionalColumn,
  nextRowSort,
  type RowKey,
  type RowSort,
} from "../rows";
import { Logo, Place, NoteTag, ClashCue, GameTags } from "./EventIdentity";
import { GoingButton, type SetGoing } from "./GoingButton";
import { StagePicker } from "./Pipeline";
import { ApplyLink } from "./ApplyLink";
import { PriorityChip } from "./PriorityChip";
import { OutreachChip } from "./OutreachChip";
import { VendorPriceCue } from "./VendorPriceCue";
import { SectionHeading } from "./ListSections";
import { EventDates, OptionalEventField } from "./EventFields";
import { SelectAllEvents, SelectEvent, type EventSelection } from "./EventSelection";
import { CompareToggle } from "./CompareToggle";
import type { CompareSelection } from "../compare";

export function EventRows({
  groups,
  columns,
  sort,
  entries,
  scores,
  today,
  now = Date.now(),
  selection,
  comparison,
  setGoing,
  setStage,
  open,
}: {
  groups: ReadonlyMap<string, Event[]>;
  columns: OptionalColumn[];
  sort: RowSort;
  entries: Record<string, DisplayEntry>;
  scores: Record<string, ScoreResult>;
  today: string;
  now?: number;
  selection?: EventSelection;
  comparison?: CompareSelection;
  setGoing: SetGoing;
  setStage: (id: string, stage: Stage) => void;
  open: (e: Event) => void;
}) {
  const showOutreachColumn = columns.includes("outreach");
  const ids = Array.from(groups.values()).flatMap((items) => items.map((e) => e.id));
  function header(key: RowKey) {
    const active = sort.key === key;
    const Icon = sort.direction === "asc" ? ArrowUp : ArrowDown;
    return (
      <th key={key} role="columnheader" className={`col-${key}`} scope="col"
        aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}>
        <span>{ROW_SORT_LABELS[key]}{active && <Icon size={12} aria-hidden="true" />}</span>
      </th>
    );
  }
  function navigate(ev: KeyboardEvent<HTMLTableRowElement>, e: Event) {
    if (
      !(ev.target instanceof HTMLButtonElement) ||
      ev.target.classList.contains("compare-toggle") ||
      ev.altKey ||
      ev.metaKey ||
      ev.ctrlKey
    )
      return;
    const name = ev.target.classList.contains("row-name");
    if (!selection && ev.key.toLowerCase() === "g") {
      ev.preventDefault();
      if (!ev.repeat) setGoing([e.id], !entries[e.id]?.going);
      return;
    }
    if (!name && !ev.target.classList.contains("going-button")) return;
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
    <div className="rows-wrap">
      {/* Mobile rows use CSS grid and block cells. Explicit native roles retain
          the table structure in WebKit. The headers describe the current sort. */}
      <table className="event-rows" data-selecting={Boolean(selection)} role="table">
        <caption className="sr-only">
          Event opportunities. Use the arrow keys, Home or End
          on event names to move between rows. Enter or Space activates the focused control.
          Outside bulk selection, G toggles Going.
        </caption>
        <thead role="rowgroup">
          <tr role="row">
            {selection && (
              <th role="columnheader" className="col-select" scope="col">
                <SelectAllEvents selection={selection} />
              </th>
            )}
            {header("name")}
            {header("dates")}
            {header("country")}
            {header("priority")}
            <th scope="col" role="columnheader" className="col-games">Games</th>
            {columns.map(header)}
            {header("stage")}
            {header("going")}
            <th scope="col" role="columnheader" className="col-apply">Apply</th>
            {comparison && <th scope="col" role="columnheader" className="col-compare">Pin</th>}
          </tr>
        </thead>
        {Array.from(groups, ([key, items]) => (
          <tbody key={key} role="rowgroup">
            {key && (
              <tr role="row" className="month-divider">
                <th scope="rowgroup" colSpan={8 + columns.length + Number(Boolean(selection)) + Number(Boolean(comparison))}>
                  <SectionHeading groupKey={key} sortKey={sort.key} items={items} />
                </th>
              </tr>
            )}
            {items.map((e) => {
              const entry = entries[e.id] || emptyEntry;
              const past = !upcoming(e, today);
              const dates = displayDateLabel(e, today);
              const status = scheduleStatus(e);
              const application = vendorApplyAction(e, now);
              return (
                <tr
                  key={e.id}
                  data-event-id={e.id}
                  role="row"
                  data-going={entry.going}
                  data-apply={Boolean(application)}
                  data-selected={selection?.selected.has(e.id)}
                  data-event-status={e.event_status}
                  data-past={past}
                  onKeyDown={(ev) => navigate(ev, e)}
                  onClick={(ev) => {
                    if (
                      (ev.target as Element).closest("a,button,input,label,.stage-control")
                    )
                      return;
                    ev.currentTarget
                      .querySelector<HTMLButtonElement>(".row-name")
                      ?.focus({ preventScroll: true });
                    if (selection) selection.toggle(e.id, ev.shiftKey);
                    else open(e);
                  }}
                >
                  {selection && (
                    <td role="cell" className="row-select">
                      <SelectEvent e={e} selection={selection} />
                    </td>
                  )}
                  <td role="cell" className="row-identity">
                    <div>
                      <Logo e={e} size="row" />
                      <div>
                        <button
                          className="row-name"
                          aria-pressed={selection?.selected.has(e.id)}
                          onClick={(ev) =>
                            selection ? selection.toggle(e.id, ev.shiftKey) : open(e)
                          }
                          title={e.name}
                        >
                          {e.name}
                        </button>
                        <div className="row-markers">
                          {e.is_new_find && (
                            <span className="source-chip new-find">
                              New find
                            </span>
                          )}
                          {entry.note.trim() && <NoteTag compact />}
                          {past && <span>Past</span>}
                          <ClashCue score={scores[e.id]} entries={entries} />
                          <VendorPriceCue event={e} now={now} />
                        </div>
                      </div>
                    </div>
                  </td>
                  <td
                    role="cell"
                    className="row-dates"
                    data-status={e.date_status}
                    title={status + " · " + dates}
                  >
                    <EventDates e={e} date={dates} />
                  </td>
                  <td role="cell" className="row-place">
                    <Place e={e} />
                  </td>
                  <td role="cell" className="row-priority">
                    <PriorityChip result={scores[e.id]} />
                    {!showOutreachColumn && <OutreachChip outreach={e.outreach} />}
                  </td>
                  <td role="cell" className="row-games">
                    <div><GameTags event={e} /></div>
                  </td>
                  {columns.map((field) => (
                    <td role="cell" className={`row-${field}`} key={field}
                      title={field === "notes" ? entry.note : undefined}>
                      <OptionalEventField field={field} e={e} entry={entry} selecting={Boolean(selection)} />
                    </td>
                  ))}
                  <td role="cell" className="row-stage">
                    <StagePicker name={e.name} entry={entry} onChange={(stage) => setStage(e.id, stage)} />
                  </td>
                  <td role="cell" className="row-going">
                    {!selection && <GoingButton e={e} going={entry.going} setGoing={setGoing} compact />}
                    {selection && entry.going && <span className="going-marker">Going</span>}
                  </td>
                  <td role="cell" className="row-apply">
                    {application && <ApplyLink action={application} name={e.name} compact />}
                  </td>
                  {comparison && <td role="cell" className="row-compare">
                    <CompareToggle event={e} selection={comparison} />
                  </td>}
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </div>
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
  const sortId = useId();
  const Direction = sort.direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <div className="row-sort-control">
      <label htmlFor={sortId}>Sort by</label>
      <select id={sortId} value={sort.key} onChange={(ev) => setSort(nextRowSort(sort, ev.target.value as RowKey))}>
        {Object.entries(ROW_SORT_LABELS).map(([key, label]) => (
          <option key={key} value={key}>{label}</option>
        ))}
      </select>
      <button
        className="button"
        onClick={() => setSort(nextRowSort(sort, sort.key))}
        aria-label="Sort descending"
        aria-pressed={sort.direction === "desc"}
      >
        <Direction size={15} />
      </button>
    </div>
  );
}
