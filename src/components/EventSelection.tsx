import { useRef, useState } from "react";
import { X } from "lucide-react";
import type { Event } from "../model";
import { selectAllVisible, selectRange } from "../rows";
import type { SetGoing } from "./GoingButton";

export function useEventSelection(events: Event[], setGoing: SetGoing) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const anchor = useRef<string | null>(null);
  const ids = events.map(({ id }) => id);
  const visibleSelection = ids.filter((id) => selected.has(id));

  function toggle(id: string, shift: boolean) {
    const start = shift ? anchor.current : null;
    setSelected((current) => selectRange(ids, current, id, start));
    if (!shift || !ids.includes(anchor.current ?? "")) anchor.current = id;
  }
  function selectAll(checked: boolean) {
    setSelected(selectAllVisible(ids, checked));
    anchor.current = null;
  }
  function apply(going: boolean) {
    setGoing(visibleSelection, going);
    selectAll(false);
  }

  return {
    selected,
    toggle,
    selectAll,
    apply,
    count: visibleSelection.length,
    all: visibleSelection.length > 0 && visibleSelection.length === ids.length,
  };
}

export type EventSelection = ReturnType<typeof useEventSelection>;

export function SelectAllEvents({ selection }: { selection: EventSelection }) {
  return (
    <label className="select-all">
      <input
        type="checkbox"
        aria-label="Select all visible"
        checked={selection.all}
        ref={(input) => {
          if (input) input.indeterminate = selection.count > 0 && !selection.all;
        }}
        onChange={(ev) => selection.selectAll(ev.target.checked)}
      />
      <span>Select all visible</span>
    </label>
  );
}

export function SelectEvent({ e, selection }: { e: Event; selection: EventSelection }) {
  return (
    <label>
      <input
        type="checkbox"
        aria-label={`Select ${e.name}`}
        checked={selection.selected.has(e.id)}
        onChange={(ev) => selection.toggle(e.id, (ev.nativeEvent as MouseEvent).shiftKey)}
      />
    </label>
  );
}

export function EventBulkBar({ selection, rows }: { selection: EventSelection; rows: boolean }) {
  const { count, apply, selectAll } = selection;
  return (
    <>
      <span role="status" className="sr-only">{count} events selected</span>
      <div className="bulk-bar" role="group" aria-label="Bulk selection">
        <strong>{count} selected</strong>
        <button className="button primary" disabled={!count} onClick={() => apply(true)}>Mark Going</button>
        <button className="button" disabled={!count} onClick={() => apply(false)}>Unmark</button>
        <button className="button" aria-label="Clear selection" disabled={!count} onClick={() => selectAll(false)}>
          <X size={16} />
        </button>
      </div>
      <div className={rows ? "mobile-select-all" : "grid-select-all"}>
        <SelectAllEvents selection={selection} />
      </div>
    </>
  );
}
