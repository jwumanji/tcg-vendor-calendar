import { useId } from "react";
import { Pin } from "lucide-react";
import { MAX_COMPARE_PINS, type CompareSelection } from "../compare";
import type { Event } from "../model";

export function CompareToggle({ event, selection }: { event: Event; selection: CompareSelection }) {
  const hintId = useId();
  const pinned = selection.pins.some(({ id }) => id === event.id);
  const full = !pinned && selection.pins.length >= MAX_COMPARE_PINS;
  return (
    <button
      type="button"
      className="button compare-toggle"
      aria-label={`Compare ${event.name}`}
      aria-pressed={pinned}
      aria-disabled={full || undefined}
      aria-describedby={full ? hintId : undefined}
      onClick={(ev) => {
        ev.stopPropagation();
        if (!full) selection.toggle(event);
      }}
    >
      <span className="compare-toggle-label"><Pin size={15} aria-hidden="true" /> Compare</span>
      {pinned && <small aria-hidden="true">Pinned</small>}
      {full && <small id={hintId}>Remove one to pin another</small>}
    </button>
  );
}
