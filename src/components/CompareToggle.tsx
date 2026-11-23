import { Pin } from "lucide-react";
import { MAX_COMPARE_PINS, type CompareSelection } from "../compare";
import type { Event } from "../model";

export function CompareToggle({ event, selection }: { event: Event; selection: CompareSelection }) {
  const pinned = selection.pins.some(({ id }) => id === event.id);
  const full = !pinned && selection.pins.length >= MAX_COMPARE_PINS;
  return (
    <button
      type="button"
      className="button compare-toggle"
      aria-label={`Pin ${event.name} for comparison`}
      aria-pressed={pinned}
      aria-disabled={full || undefined}
      title={pinned ? "Remove from comparison" : full ? "Comparison is full" : "Pin for comparison"}
      onClick={(ev) => {
        ev.stopPropagation();
        if (!full) selection.toggle(event);
      }}
    >
      <Pin size={17} aria-hidden="true" />
    </button>
  );
}
