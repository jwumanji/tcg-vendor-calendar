import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { findHomeBase, resolveHomeBase } from "../homeBase";
import { type BudgetAmount, type BudgetDefaults, type Event, type TripBudget as Budget } from "../model";
import { budgetLabels, budgetOrigin, calculateTripBudget, convertBudgetAmount, pendingTripTotal, readBudgetMoney, readTripBudgetForm, walkAwayPrice } from "../tripBudget";
import { budgetFxDate, formatVendorAmount, formatVendorUsd, missingPriceMessage, snapshotCurrencies, snapshotFx, vendorPriceBasisLabels } from "../vendorPricing";
import { Modal } from "./Modal";

const vndNumber = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function Converted({ value }: { value: { usd: number; vnd: number } }) {
  return <><span>VND {vndNumber.format(value.vnd)}</span> <span>· {formatVendorUsd(value.usd)}</span></>;
}

function CostValue({ value, showVnd = false }: { value: BudgetAmount; showVnd?: boolean }) {
  const converted = convertBudgetAmount(value);
  return (
    <>
      <span>{formatVendorAmount(value.amount, value.currency)}</span>
      {converted
        ? <>
          {value.currency !== "USD" && <span> · {formatVendorUsd(converted.usd)}</span>}
          {showVnd && value.currency !== "VND" && <span> · VND {vndNumber.format(converted.vnd)}</span>}
        </>
        : value.amount > 0 && <small>{Object.hasOwn(snapshotFx, value.currency) ? "Amount too large to convert." : `No snapshot FX rate for ${value.currency}.`}</small>}
    </>
  );
}

function BudgetRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return <div className="trip-budget-row"><dt>{label}</dt><dd>{children}</dd></div>;
}

export function TripBudget({
  event, now, today, occurrence, homeBase, local, defaults, onSave,
}: {
  event: Event;
  now: number;
  today: string;
  occurrence?: string;
  homeBase?: string;
  local?: Budget;
  defaults?: BudgetDefaults;
  onSave?: (value?: Budget) => void;
}) {
  const budget = local ?? event.trip_budget;
  const base = resolveHomeBase(homeBase);
  const travelNeedsReview = !!budget?.costs?.travel && budget.travelHomeBase !== base.id;
  const previousBase = findHomeBase(budget?.travelHomeBase);
  const result = calculateTripBudget(event, now, today, homeBase, occurrence, budget, defaults);
  const { tableFee, total, perDay, subtotal, days, extraCosts, nights, mealDays } = result;
  const { ceiling, basis, quote, above } = walkAwayPrice(event, now, budget?.walkAway);
  const defaultsNeedDays =
    (!!defaults?.lodging?.amount && !budget?.costs?.lodging && nights === null) ||
    (!!defaults?.meals?.amount && !budget?.costs?.meals && mealDays === null);
  const [editing, setEditing] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const localNights = result.localEvent && budget?.nights === undefined;
  return (
    <section className="trip-budget" aria-labelledby="trip-budget-title">
      <h2 id="trip-budget-title">Budget / break-even</h2>
      <p className="trip-budget-origin">{budgetOrigin(homeBase)}</p>
      <dl className="trip-budget-costs">
        <BudgetRow label="Table fee">
          {tableFee ? (
            <>
              <CostValue value={tableFee} showVnd />
              <small>{vendorPriceBasisLabels[tableFee.basis]}{tableFee.basis !== "listed" &&
                tableFee.option.amount_incl_vat !== undefined && " · incl. VAT"}</small>
            </>
          ) : missingPriceMessage(event, now)}
        </BudgetRow>
        <BudgetRow label="Walk-away table fee">
          {ceiling ? (
            <>
              <CostValue value={ceiling} showVnd />
              <small>{basis === "custom" ? "Your ceiling" : basis && `${vendorPriceBasisLabels[basis]} ceiling`}</small>
              {quote && (above === true
                ? <strong className="trip-budget-above" role="alert">Above walk-away: the quote exceeds your ceiling.</strong>
                : <small>{above === null ? "Quote comparison needs a snapshot FX rate." : "Quote is within your walk-away fee."}</small>)}
            </>
          ) : "Walk-away fee cannot be set yet from published or listed rates. You can enter your own ceiling."}
        </BudgetRow>
        {extraCosts.map(({ category, cost, usesDefault }) => (
          <BudgetRow key={category} label={budgetLabels[category]}>
            {cost ? <CostValue value={cost} /> : <small>Not entered</small>}
            {category === "travel" && travelNeedsReview && (
              <small>{previousBase ? `Saved for ${previousBase.city}. ` : "Original home base unknown. "}Review this travel amount for {base.city}.</small>
            )}
            {category === "lodging" && localNights && (!cost || usesDefault) && (
              <small>0 lodging nights because the show is in your home city{usesDefault ? " · Tools default" : ""}.</small>
            )}
            {category === "lodging" && usesDefault && !localNights && (
              <small>{nights} lodging {nights === 1 ? "night" : "nights"}{budget?.nights === undefined && ` assumed from ${days} selling days`} · Tools default</small>
            )}
            {category === "meals" && usesDefault && (
              <small>{mealDays} meal {mealDays === 1 ? "day" : "days"}{budget?.mealDays === undefined && ` assumed from ${days} selling days`} · Tools default</small>
            )}
          </BudgetRow>
        ))}
        {budget?.custom?.map((cost) => cost.amount > 0 && (
          <BudgetRow key={cost.id} label={cost.label}><CostValue value={cost} /></BudgetRow>
        ))}
      </dl>
      <div className="trip-budget-totals" aria-live="polite">
        <dl>
          <BudgetRow label="Trip total for entered costs">
            {total ? <strong><Converted value={total} /></strong> : (
              <>
                {subtotal && <strong><Converted value={subtotal} /><small>Known costs subtotal</small></strong>}
                <small>{pendingTripTotal(event, result)}</small>
              </>
            )}
          </BudgetRow>
          {perDay && (
            <BudgetRow label="Break-even sales per selling day">
              <strong><Converted value={perDay} /></strong>
              <small>{days} selling {days === 1 ? "day" : "days"}</small>
            </BudgetRow>
          )}
        </dl>
        <p>Break-even is the gross sales to cover trip costs, before cost of goods. It uses the costs shown above, including any Tools defaults.</p>
        {days === null && <p>Selling days are unknown for this schedule.</p>}
        {defaultsNeedDays && <p>Enter lodging nights or meal days to apply the corresponding Tools default.</p>}
      </div>
      <p className="trip-budget-fx">Conversions use the {budgetFxDate} research FX snapshot.</p>
      {onSave && <div className="money-item-actions">
        <button ref={editButton} type="button" className="button" aria-haspopup="dialog" onClick={() => setEditing(true)}>
          Edit trip budget
        </button>
        {local && <button type="button" className="button" onClick={() => {
          editButton.current?.focus();
          onSave(undefined);
        }}>{event.trip_budget ? "Reset budget to shared" : "Reset budget"}</button>}
      </div>}
      {editing && onSave && (
        <BudgetEditor budget={budget} result={result} defaults={defaults} base={base} travelNeedsReview={travelNeedsReview}
          close={() => setEditing(false)}
          save={(value) => {
            onSave(value);
            setEditing(false);
          }} />
      )}
    </section>
  );
}

function MoneyInputs({ name, value, estimate, required = false }: {
  name: string;
  value?: BudgetAmount;
  estimate?: BudgetAmount;
  required?: boolean;
}) {
  return (
    <div className="trip-budget-inputs">
      <label>Amount<input name={`${name}-amount`} type="number" inputMode="decimal" min="0" step="any"
        required={required} defaultValue={value?.amount}
        placeholder={estimate ? String(estimate.amount) : undefined} /></label>
      <label>Currency<input name={`${name}-currency`} maxLength={3} autoCapitalize="characters"
        defaultValue={value?.currency} placeholder={estimate?.currency ?? "VND"} /></label>
    </div>
  );
}

function BudgetEditor({ budget, result, defaults, base, travelNeedsReview, close, save }: {
  budget?: Budget;
  result: ReturnType<typeof calculateTripBudget>;
  defaults?: BudgetDefaults;
  base: ReturnType<typeof resolveHomeBase>;
  travelNeedsReview: boolean;
  close: () => void;
  save: (value: Budget) => void;
}) {
  const [custom, setCustom] = useState(() => (budget?.custom ?? []).map(({ id }) => id));
  const [error, setError] = useState<{ message: string }>();
  const saveError = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) saveError.current?.scrollIntoView({ block: "nearest" });
  }, [error]);
  const addButton = useRef<HTMLButtonElement>(null);
  const addedName = useRef<HTMLInputElement>(null);
  const newId = useRef<string>(undefined);
  useEffect(() => {
    if (newId.current) {
      addedName.current?.focus();
      newId.current = undefined;
    }
  }, [custom]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      save(readTripBudgetForm(new FormData(event.currentTarget), custom, result.extraCosts, base.id, budget));
    } catch (error) {
      setError({ message: (error as Error).message });
    }
  }
  return (
    <Modal title="Edit trip budget" titleId="trip-budget-editor-title" closeLabel="Close trip budget editor"
      close={close} className="money-editor trip-budget-editor">
      <form className="outreach-form" onSubmit={submit}>
        <fieldset className="outreach-wide">
          <legend>Walk-away table fee</legend>
          <p>Leave the amount blank to use the applicable published or listed price. A blank currency uses VND.</p>
          <MoneyInputs name="walkAway" value={budget?.walkAway} />
        </fieldset>
        <p className="outreach-wide">Enter the costs for this trip. Blank amounts use any available Tools defaults. Enter 0 to override a default with no cost. Currency defaults to VND unless a Tools rate applies.</p>
        <p className="outreach-wide">Snapshot currencies for totals: {snapshotCurrencies}.</p>
        {result.extraCosts.map(({ category, estimate }) => (
          <fieldset key={category}>
            <legend>{budgetLabels[category]}</legend>
            <MoneyInputs name={category} value={budget?.costs?.[category]} estimate={estimate} />
            {category === "travel" && travelNeedsReview && (
              <label className="money-check"><input type="checkbox" name="confirm-travel-base" />
                Confirm this travel amount for {base.city}
              </label>
            )}
            {category === "lodging" && (
              <label className="trip-budget-assumption">Lodging nights
                <input name="nights" type="number" min="0" step="1" inputMode="numeric"
                  defaultValue={budget?.nights} placeholder={result.suggestedNights?.toString() ?? "Unknown"} />
                {defaults?.lodging
                  ? <small>{formatVendorAmount(defaults.lodging.amount, defaults.lodging.currency)} per night from Tools</small>
                  : <small>Used with the lodging rate in Tools.</small>}
              </label>
            )}
            {category === "meals" && (
              <label className="trip-budget-assumption">Meal days
                <input name="mealDays" type="number" min="0" step="1" inputMode="numeric"
                  defaultValue={budget?.mealDays} placeholder={result.days?.toString() ?? "Unknown"} />
                {defaults?.meals
                  ? <small>{formatVendorAmount(defaults.meals.amount, defaults.meals.currency)} per day from Tools</small>
                  : <small>Used with the meal rate in Tools.</small>}
              </label>
            )}
          </fieldset>
        ))}
        {custom.map((id, index) => {
          const cost = budget?.custom?.find((line) => line.id === id);
          return (
            <fieldset key={id} className="outreach-wide">
              <legend>Custom cost</legend>
              <label>Name<input name={`custom-${id}-label`} required defaultValue={cost?.label}
                ref={newId.current === id ? addedName : undefined} /></label>
              <MoneyInputs name={`custom-${id}`} value={cost} required />
              <button className="button" type="button" aria-label={`Remove ${cost?.label || `custom cost ${index + 1}`}`}
                onClick={() => {
                  addButton.current?.focus();
                  setCustom((lines) => lines.filter((line) => line !== id));
                }}>Remove cost</button>
            </fieldset>
          );
        })}
        <div className="outreach-wide">
          <button className="button" type="button" ref={addButton} onClick={() => {
            const id = crypto.randomUUID();
            newId.current = id;
            setCustom((lines) => [...lines, id]);
          }}>Add custom cost</button>
        </div>
        {error && <p ref={saveError} className="outreach-wide" role="alert">{error.message}</p>}
        <div className="money-item-actions outreach-wide">
          <button className="button primary" type="submit">Save trip budget</button>
          <button className="button" type="button" onClick={close}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

export function BudgetDefaultsForm({ defaults, save }: {
  defaults?: BudgetDefaults;
  save: (value: BudgetDefaults) => void;
}) {
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => form.current?.reset(), [defaults]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    try {
      const lodging = readBudgetMoney(fields, "defaultLodging");
      const meals = readBudgetMoney(fields, "defaultMeals");
      save({ ...(lodging && { lodging }), ...(meals && { meals }) });
      setStatus("Trip budget defaults saved.");
      setError("");
    } catch (error) {
      setError((error as Error).message);
      setStatus("");
    }
  }
  return (
    <form ref={form} className="outreach-form trip-budget-defaults" aria-labelledby="trip-budget-defaults-title"
      onSubmit={submit} onChange={() => setStatus("")}>
      <h3 id="trip-budget-defaults-title" className="outreach-wide">Trip budget defaults</h3>
      <fieldset>
        <legend>Lodging per night</legend>
        <MoneyInputs name="defaultLodging" value={defaults?.lodging} />
      </fieldset>
      <fieldset>
        <legend>Meals per day</legend>
        <MoneyInputs name="defaultMeals" value={defaults?.meals} />
      </fieldset>
      <p className="outreach-wide">Leave amounts blank to skip defaults. A blank currency uses VND. Snapshot currencies: {snapshotCurrencies}.</p>
      <div className="outreach-wide"><button className="button" type="submit">Save budget defaults</button></div>
      {error && <p role="alert" className="outreach-wide">{error}</p>}
      <p role="status" className="outreach-wide">{status}</p>
    </form>
  );
}
