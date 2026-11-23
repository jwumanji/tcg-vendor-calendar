import { useId, useRef, type ReactNode, type RefObject } from "react";
import { Pin, X } from "lucide-react";
import { canCompare, compareOccurrenceKey, compareOverlaps, confirmedCompareRange, MAX_COMPARE_PINS, type PinnedEvent } from "../compare";
import { saigonDay, vendorApplyAction } from "../eventDecision";
import { upcomingMilestones } from "../milestones";
import type { BudgetDefaults, TripBudget } from "../model";
import type { ScoreResult } from "../scoring";
import { emptyEntry, type DisplayEntry } from "../storage";
import { calculateTripBudget, pendingTripTotal, travelCostReview, tripDefaultsNeedDays } from "../tripBudget";
import { displayDateLabel, formatDateRange, placeLabel } from "../utils";
import { budgetFxDate, formatVendorAmount, formatVendorUsd, missingPriceMessage, vendorPriceBasisLabels } from "../vendorPricing";
import { ApplyLink } from "./ApplyLink";
import { EventDates } from "./EventFields";
import { Status } from "./EventIdentity";
import { Modal } from "./Modal";
import { PriorityChip } from "./PriorityChip";
import { MilestoneTimes } from "./UpcomingMilestones";

export function CompareTray({ pins, trigger, open, remove }: {
  pins: readonly PinnedEvent[];
  trigger: RefObject<HTMLButtonElement | null>;
  open: () => void;
  remove: (id: string) => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const trayId = useId();
  const count = pins.length;
  return (
    <section className="compare-tray" aria-labelledby="compare-tray-title">
      <div className="compare-tray-heading">
        <div>
          <h3 id="compare-tray-title" ref={heading} tabIndex={-1}><Pin size={16} aria-hidden="true" /> Compare events</h3>
          <p role="status">
            {count ? `${count} of ${MAX_COMPARE_PINS} pinned.` : "Use the pin on an event to compare it."}
            {count < 2 && (count ? " Pin one more to compare." : " Pin at least two.")}
            {count === MAX_COMPARE_PINS && " Remove one to pin another."}
          </p>
        </div>
        <button type="button" className="button compare-trigger" aria-haspopup="dialog" ref={trigger}
          disabled={!canCompare(pins)} onClick={open}>
          Compare
        </button>
      </div>
      {count > 0 && (
        <ul className="compare-pins">
          {pins.map(({ event, visible }, index) => (
            <li key={event.id}>
              <button type="button" className="button compare-pin" aria-label={`Remove ${event.name} from comparison`}
                aria-describedby={visible ? undefined : `${trayId}-visibility-${index}`}
                onClick={(ev) => {
                  const item = ev.currentTarget.parentElement;
                  const neighbor = item?.nextElementSibling ?? item?.previousElementSibling;
                  (neighbor?.querySelector("button") ?? heading.current)?.focus({ preventScroll: true });
                  remove(event.id);
                }}>
                <span>{event.name}{!visible && <small id={`${trayId}-visibility-${index}`}>Outside current results</small>}</span>
                <X size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type CompareFields = {
  pins: readonly PinnedEvent[];
  entries: Record<string, DisplayEntry>;
  scores: Record<string, ScoreResult>;
  budgets: Record<string, TripBudget>;
  defaults?: BudgetDefaults;
  homeBase: string;
  today: string;
  now: number;
  onOccurrence: (id: string, occurrence: string) => void;
};

export function CompareEvents({ close, returnFocus, ...fields }: CompareFields & {
  close: () => void;
  returnFocus: () => HTMLElement | null;
}) {
  return (
    <Modal title="Compare events" titleId="compare-title" closeLabel="Close comparison"
      className="compare-dialog" close={close} returnFocus={returnFocus}>
      <CompareTable {...fields} />
    </Modal>
  );
}

function BudgetValue({ value }: { value: { usd: number; vnd: number } }) {
  return <><strong>{formatVendorAmount(Math.round(value.vnd), "VND")}</strong><small>{formatVendorUsd(value.usd)}</small></>;
}

export function CompareTable({ pins, entries, scores, budgets, defaults, homeBase, today, now, onOccurrence }: CompareFields) {
  const tableId = useId();
  const columns = pins.map((pin) => {
    const { event, occurrences, range } = pin;
    const entry = entries[event.id] ?? emptyEntry;
    const score = scores[event.id];
    const plannedCosts = budgets[event.id] ?? event.trip_budget;
    const budget = calculateTripBudget(event, now, today, homeBase, occurrences.length ? range : undefined, plannedCosts, defaults);
    const { tableFee, total, subtotal, perDay, days } = budget;
    const travelReview = travelCostReview(plannedCosts, homeBase);
    const conflicts = compareOverlaps(pin, pins);
    const milestone = upcomingMilestones([event], now)[0]?.milestone;
    const selectedWeekendEnded = occurrences.length > 0 && range && range.end_date < saigonDay(now);
    const application = !selectedWeekendEnded && vendorApplyAction(event, now);
    const date = occurrences.length && range ? formatDateRange(range.start_date, range.end_date)
      : event.date_status === "tba" && !event.estimated_month ? "Dates not announced" : displayDateLabel(event, today);
    const venue = (occurrences.length ? range?.venue : undefined) ?? event.venue?.trim();
    const location = event.country ? placeLabel(event) : event.city;
    const rows: [string, ReactNode][] = [
      ["Dates and certainty", occurrences.length > 1 && range ? (
        <>
          <label className="compare-weekend">
            <span>Published weekend<span className="sr-only"> for {event.name}</span></span>
            <select value={compareOccurrenceKey(range)} onChange={(ev) => onOccurrence(event.id, ev.target.value)}>
              {occurrences.map((item) => (
                <option key={compareOccurrenceKey(item)} value={compareOccurrenceKey(item)}>
                  {formatDateRange(item.start_date, item.end_date)}
                </option>
              ))}
            </select>
          </label>
          <Status e={event} />
        </>
      ) : <EventDates e={event} date={date} />],
      ["Venue", <>{venue || "Venue not announced"}{location && <small>{location}</small>}</>],
      ["Pipeline stage", <>{entry.stage}{entry.stageSuggested && <small>Suggested from vendor updates</small>}</>],
      ["Priority", <><PriorityChip result={score} /><small aria-hidden="true">{score.confidence} confidence</small></>],
      ["Confirmed overlap", conflicts.length ? (
        <ul className="compare-overlaps">
          {conflicts.map(({ event: other, overlap }) => <li key={other.id}>
            {other.name}<small>{formatDateRange(overlap.start_date, overlap.end_date)}</small>
          </li>)}
        </ul>
      ) : confirmedCompareRange(pin) ? "No confirmed overlap" : "No confirmed dates to check"],
      ["Eligible table fee", tableFee ? (
        <>
          <strong>{formatVendorAmount(tableFee.amount, tableFee.currency)}</strong>
          <small>{vendorPriceBasisLabels[tableFee.basis]}{tableFee.basis !== "listed" &&
            tableFee.option.amount_incl_vat !== undefined && " · incl. VAT"}</small>
          {tableFee.basis === "listed"
            ? tableFee.conditions && <small>{tableFee.conditions}</small>
            : <small>{tableFee.option.name}</small>}
        </>
      ) : missingPriceMessage(event, now)],
      ["Trip total for entered costs", (
        <>
          {total ? <BudgetValue value={total} /> : (
            <>
              {pendingTripTotal(event, budget)}
              {subtotal && <small>Known costs subtotal</small>}
              {subtotal && <BudgetValue value={subtotal} />}
            </>
          )}
          {travelReview && <small>{travelReview}</small>}
          {tripDefaultsNeedDays(budget, plannedCosts, defaults) &&
            <small>Enter lodging nights or meal days to apply the corresponding Tools default.</small>}
        </>
      )],
      ["Break-even per selling day", perDay ? <><BudgetValue value={perDay} /><small>{days} selling {days === 1 ? "day" : "days"}</small></>
        : days === null ? "Selling days are unconfirmed." : "Available when the trip total is known."],
      ["Next verified milestone", milestone ? <><strong>{milestone.label}</strong><MilestoneTimes milestone={milestone} /></>
        : "No upcoming verified milestone"],
      ["Vendor application", application ? <ApplyLink action={application} name={event.name} /> : "No application link available"],
    ];
    return { event, rows };
  });
  return (
    <>
      <table className="compare-table" role="table" aria-label="Pinned event comparison">
        <thead role="rowgroup">
          <tr role="row">
            <th scope="col" role="columnheader" className="compare-field">Field</th>
            {columns.map(({ event }, index) =>
              <th key={event.id} scope="col" role="columnheader" id={`${tableId}-event-${index}`}>{event.name}</th>)}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {columns[0]?.rows.map(([label], row) => (
            <tr key={label} role="row">
              <th scope="row" role="rowheader" id={`${tableId}-field-${row}`}>{label}</th>
              {columns.map(({ event, rows }, col) => (
                <td key={event.id} role="cell" headers={`${tableId}-event-${col} ${tableId}-field-${row}`}>
                  <span className="compare-mobile-name" aria-hidden="true">{event.name}</span>
                  <div>{rows[row][1]}</div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="compare-budget-note">Break-even covers entered trip costs and any Tools defaults before cost of goods.
        Conversions use the {budgetFxDate} research FX snapshot.</p>
    </>
  );
}
