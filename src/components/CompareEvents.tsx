import { useId, useLayoutEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from "react";
import { Pin, X } from "lucide-react";
import { canCompare, compareOverlaps, confirmedCompareRange, MAX_COMPARE_PINS, type PinnedEvent } from "../compare";
import { saigonDay, vendorApplyAction } from "../eventDecision";
import { upcomingMilestones } from "../milestones";
import type { BudgetDefaults, TripBudget } from "../model";
import type { ScoreResult } from "../scoring";
import { emptyEntry, type DisplayEntry } from "../storage";
import { calculateTripBudget, pendingTripTotal, travelCostReview, tripDefaultsNeedDays } from "../tripBudget";
import { displayDateLabel, formatDateRange, occurrenceKey, placeLabel } from "../utils";
import { budgetFxDate, formatVendorAmount, formatVendorUsd, missingPriceMessage, vendorPriceBasisLabels } from "../vendorPricing";
import { ApplyLink } from "./ApplyLink";
import { Status } from "./EventIdentity";
import { Modal } from "./Modal";
import { PriorityChip } from "./PriorityChip";
import { MilestoneTimes } from "./UpcomingMilestones";

export function CompareTray({ pins, canPin, trigger, open, remove }: {
  pins: readonly PinnedEvent[];
  canPin: boolean;
  trigger: RefObject<HTMLButtonElement | null>;
  open: () => void;
  remove: (id: string) => void;
}) {
  const tray = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const trayId = useId();
  const count = pins.length;
  const hasPins = count > 0;
  useLayoutEffect(() => {
    if (!hasPins || !tray.current) return;
    const bar = tray.current;
    const root = document.documentElement;
    const update = () => root.style.setProperty("--compare-tray-height", `${bar.offsetHeight}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--compare-tray-height");
    };
  }, [hasPins]);
  return (
    <section className="compare-tray" aria-labelledby="compare-tray-title" data-pinned={hasPins} ref={tray}>
      <div className="compare-tray-heading">
        <div>
          <h3 id="compare-tray-title" ref={heading} tabIndex={-1}><Pin size={16} aria-hidden="true" /> Compare events</h3>
          <p role="status">
            {hasPins ? <strong>{count} of {MAX_COMPARE_PINS} pinned.</strong> : "Pin at least two events to compare them."}
            {canPin && count === 1 && " Pin one more to compare."}
            {canPin && count === MAX_COMPARE_PINS && " Remove one to pin another."}
            {!canPin && " Pin events in List."}
          </p>
        </div>
        <button type="button" className="button compare-trigger" aria-haspopup="dialog" ref={trigger}
          disabled={!canCompare(pins)} onClick={open}>
          Compare
        </button>
      </div>
      {hasPins && (
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
                <span className="compare-pin-copy">
                  <span className="compare-pin-name" title={event.name}>{event.name}</span>
                  {!visible && <small id={`${trayId}-visibility-${index}`}>Outside current results</small>}
                </span>
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

function BudgetValue({ value, caption }: { value: { usd: number; vnd: number }; caption?: string }) {
  return <><strong>{formatVendorAmount(Math.round(value.vnd), "VND")}</strong><small>{formatVendorUsd(value.usd)}</small>
    {caption && <small>{caption}</small>}</>;
}

export function CompareTable({ pins, entries, scores, budgets, defaults, homeBase, today, now, onOccurrence }: CompareFields) {
  const tableId = useId();
  const allDatesUnannounced = pins.every(({ event }) =>
    event.date_status === "tba" && !event.estimated_month && !event.event_status);
  const plannedBudgets = pins.map(({ event }) =>
    Object.hasOwn(budgets, event.id) ? budgets[event.id] : event.trip_budget);
  const showSalesTargets = plannedBudgets.some((budget) => budget?.contributionMarginBps !== undefined);
  const columns = pins.map((pin, index) => {
    const { event, occurrences, range } = pin;
    const entry = entries[event.id] ?? emptyEntry;
    const score = scores[event.id];
    const plannedCosts = plannedBudgets[index];
    const budget = calculateTripBudget(event, now, today, homeBase, occurrences.length ? range : undefined, plannedCosts, defaults);
    const { tableFee, total, subtotal, perDay, days, salesTarget } = budget;
    const travelReview = travelCostReview(plannedCosts, homeBase);
    const conflicts = compareOverlaps(pin, pins);
    const milestone = upcomingMilestones([event], now)[0]?.milestone;
    const selectedWeekendEnded = occurrences.length > 0 && range && range.end_date < saigonDay(now);
    const application = !selectedWeekendEnded && vendorApplyAction(event, now);
    const date = occurrences.length && range ? formatDateRange(range.start_date, range.end_date)
      : event.date_status === "tba" && !event.estimated_month ? "Dates not announced" : displayDateLabel(event, today);
    const venue = (occurrences.length ? range?.venue : undefined) ?? event.venue?.trim();
    const location = event.country ? placeLabel(event) : event.city;
    const needsBudgetDays = tripDefaultsNeedDays(budget, plannedCosts, defaults);
    const pendingTotal = !total && pendingTripTotal(event, budget);
    const rows: [string, ReactNode][] = [
      ["Dates and certainty", allDatesUnannounced ? "Dates not announced" : <div className="compare-dates">
        {occurrences.length > 1 && range ? (
          <select className="compare-weekend" aria-label={`Published weekend for ${event.name}`}
            value={occurrenceKey(range)} onChange={(ev) => onOccurrence(event.id, ev.target.value)}>
            {occurrences.map((item) => (
              <option key={occurrenceKey(item)} value={occurrenceKey(item)}>
                {formatDateRange(item.start_date, item.end_date)}
              </option>
            ))}
          </select>
        ) : <span className="compare-date">{(date !== "Dates not announced" || event.event_status) && date}</span>}
        <Status e={event} />
      </div>],
      ["Priority", <><PriorityChip result={score} /><small aria-hidden="true">{score.confidence} confidence</small></>],
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
      ["Trip total for entered costs", pendingTotal && !subtotal && !travelReview && !needsBudgetDays ? pendingTotal : (
        <>
          {total ? <BudgetValue value={total} /> : (
            <>
              {pendingTotal}
              {subtotal && <small>Known costs subtotal</small>}
              {subtotal && <BudgetValue value={subtotal} />}
            </>
          )}
          {travelReview && <small>{travelReview}</small>}
          {needsBudgetDays &&
            <small>Enter lodging nights or meal days to apply the corresponding Tools default.</small>}
        </>
      )],
      ["Break-even per selling day", perDay ? <BudgetValue value={perDay} caption={`${days} selling ${days === 1 ? "day" : "days"}`} />
        : days === null ? "Selling days are unconfirmed." : "Available when the trip total is known."],
    ];
    if (showSalesTargets) {
      rows.push(["Sales target at your margin", salesTarget ? (
        <>
          {salesTarget.total && <BudgetValue value={salesTarget.total} />}
          <small>{salesTarget.label}</small>
          {salesTarget.perDay && <div className="compare-sales-per-day">
            <BudgetValue value={salesTarget.perDay} caption="Per selling day" />
          </div>}
          {salesTarget.message && <small>{salesTarget.message}</small>}
        </>
      ) : "No margin entered."]);
    }
    rows.push(
      ["Venue", venue || location ? <>{venue || "Venue not announced"}{location && <small>{location}</small>}</> : "Venue not announced"],
      ["Pipeline stage", <>{entry.stage}{entry.stageSuggested && <small>Suggested from vendor updates</small>}</>],
      ["Confirmed overlap", conflicts.length ? (
        <ul className="compare-overlaps">
          {conflicts.map(({ event: other, overlap }) => <li key={other.id}>
            {other.name}<small>{formatDateRange(overlap.start_date, overlap.end_date)}</small>
          </li>)}
        </ul>
      ) : confirmedCompareRange(pin) ? "No confirmed overlap" : "No confirmed dates to check"],
      ["Next verified milestone", milestone ? <><strong>{milestone.label}</strong><MilestoneTimes milestone={milestone} /></>
        : "No upcoming verified milestone"],
      ["Vendor application", application ? <ApplyLink action={application} name={event.name} /> : "No application link available"],
    );
    return { event, rows };
  });
  return (
    <>
      <p className="compare-scroll-hint" data-columns={columns.length}>Swipe across to see more events.</p>
      <div className="compare-scroll" data-columns={columns.length} role="region" aria-label="Comparison fields" tabIndex={0}>
        <table className="compare-table" aria-label="Pinned event comparison"
          style={{ "--compare-columns": columns.length } as CSSProperties}>
          <thead role="rowgroup">
            <tr role="row">
              <th scope="col" role="columnheader" className="compare-field">Field</th>
              {columns.map(({ event }, index) =>
                <th key={event.id} scope="col" role="columnheader" id={`${tableId}-event-${index}`}>{event.name}</th>)}
            </tr>
          </thead>
          <tbody role="rowgroup">
            {columns[0]?.rows.map(([label, value], row) => {
              const fieldId = `${tableId}-field-${row}`;
              // Plain strings are unavailable or empty states; actual values and qualifying details stay per event.
              const shared = typeof value === "string" && columns.every(({ rows }) => rows[row][1] === value);
              return (
                <tr key={label} role="row">
                  <th scope="row" role="rowheader" id={fieldId}>{label}</th>
                  {shared ? (
                    <td className="compare-shared" colSpan={columns.length} headers={fieldId}><div>{value}</div></td>
                  ) : columns.map(({ event, rows }, col) => (
                    <td key={event.id} headers={`${tableId}-event-${col} ${fieldId}`}><div>{rows[row][1]}</div></td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="compare-budget-note">{showSalesTargets
          ? "The trip total includes entered costs and any Tools defaults. Sales targets account for stock cost and variable selling fees at the entered margins."
          : "Break-even covers entered trip costs and any Tools defaults before cost of goods."}{" "}
          Conversions use the {budgetFxDate} research FX snapshot.</p>
      </div>
    </>
  );
}
