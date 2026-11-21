import { normalizeBudgetAmount, normalizeTripBudget, validDate } from "./data";
import { estimateTravel, resolveHomeBase } from "./homeBase";
import { budgetCategories, type BudgetAmount, type BudgetDefaults, type Event, type TripBudget } from "./model";
import { dateLabel, dateSortRange } from "./utils";
import { applicableVendorPrice, snapshotFx, snapshotUsd } from "./vendorPricing";

export const budgetLabels = {
  travel: "Travel",
  lodging: "Lodging",
  meals: "Meals",
  localTransport: "Local transport",
  freight: "Freight",
  other: "Other",
} satisfies Record<(typeof budgetCategories)[number], string>;

export const budgetOrigin = (homeBase?: string) => `Home base: ${resolveHomeBase(homeBase).city}`;

export function convertBudgetAmount({ amount, currency }: BudgetAmount) {
  const usd = snapshotUsd(amount, currency);
  if (usd === undefined) return null;
  const vnd = usd * snapshotFx.VND;
  return Number.isFinite(vnd) ? { usd, vnd } : null;
}

export function sellingDays(event: Event, today: string, occurrence?: string) {
  if (event.event_status || event.date_status !== "confirmed") return null;
  const shownOccurrence = occurrence && event.occurrences?.find((range) =>
    dateLabel({ ...event, ...range }) === occurrence);
  const range = shownOccurrence || (event.occurrences?.length ? dateSortRange(event, today) : event);
  if (!range || !validDate(range.start_date) || !validDate(range.end_date) || range.end_date < range.start_date)
    return null;
  return (Date.parse(range.end_date) - Date.parse(range.start_date)) / 86_400_000 + 1;
}

export function walkAwayPrice(event: Event, now: number, custom?: BudgetAmount) {
  const quote = applicableVendorPrice(event, now, "quote");
  const publicPrice = applicableVendorPrice(event, now, "published");
  const ceiling = custom ?? publicPrice;
  const basis = custom ? "custom" as const : publicPrice?.basis;
  const quoteFx = quote && convertBudgetAmount(quote);
  const ceilingFx = ceiling && convertBudgetAmount(ceiling);
  const difference = quote && ceiling && quote.currency === ceiling.currency
    ? quote.amount - ceiling.amount
    : quoteFx && ceilingFx ? quoteFx.usd - ceilingFx.usd : null;
  return {
    ceiling,
    basis,
    quote,
    above: difference === null ? null : difference > 0,
  };
}

export function calculateTripBudget(
  event: Event, now: number, today: string, homeBase?: string, occurrence?: string,
  budget: TripBudget = event.trip_budget ?? {}, defaults: BudgetDefaults = {},
) {
  const tableFee = applicableVendorPrice(event, now);
  const days = sellingDays(event, today, occurrence);
  const localEvent = !!estimateTravel(event, resolveHomeBase(homeBase))?.local;
  const suggestedNights = localEvent ? 0 : days;
  const nights = budget.nights ?? suggestedNights;
  const mealDays = budget.mealDays ?? days;
  const extraCosts = budgetCategories.map((category) => {
    const rate = category === "lodging" || category === "meals" ? defaults[category] : undefined;
    const count = category === "lodging" ? nights : mealDays;
    const estimate = rate && count !== null
      ? { amount: rate.amount * count, currency: rate.currency }
      : undefined;
    const manual = budget.costs?.[category];
    return { category, cost: manual ?? estimate, estimate, usesDefault: !manual && !!estimate };
  });
  const costs = [
    ...(tableFee ? [tableFee] : []),
    ...extraCosts.flatMap(({ cost }) => cost?.amount ? [cost] : []),
    ...(budget.custom ?? []).filter(({ amount }) => amount > 0),
  ];
  const converted = costs.map(convertBudgetAmount);
  const known = converted.filter((cost) => cost !== null);
  const subtotal = known.reduce((sum, cost) => ({ usd: sum.usd + cost.usd, vnd: sum.vnd + cost.vnd }), { usd: 0, vnd: 0 });
  const finite = Number.isFinite(subtotal.vnd);
  const total = tableFee && known.length === costs.length && finite ? subtotal : null;
  return {
    tableFee, days, localEvent, suggestedNights, nights, mealDays, extraCosts, total,
    subtotal: known.length && finite ? subtotal : null,
    totalOverflow: !finite,
    perDay: total && days ? { usd: total.usd / days, vnd: total.vnd / days } : null,
  };
}

export function readBudgetMoney(fields: FormData, name: string, currency = "VND") {
  const amount = fields.get(`${name}-amount`);
  if (amount === null || amount === "") return undefined;
  return normalizeBudgetAmount({
    amount: Number(amount),
    currency: String(fields.get(`${name}-currency`) || "").trim().toUpperCase() || currency,
  });
}

export function readTripBudgetForm(
  fields: FormData, customIds: string[], extraCosts: ReturnType<typeof calculateTripBudget>["extraCosts"],
  homeBaseId: string, previous?: TripBudget,
) {
  const costs = Object.fromEntries(extraCosts.flatMap(({ category, estimate }) => {
    const value = readBudgetMoney(fields, category, estimate?.currency);
    return value ? [[category, value]] : [];
  }));
  const count = (name: string) => {
    const value = fields.get(name);
    return value ? Number(value) : undefined;
  };
  const travel = costs.travel;
  const previousTravel = previous?.costs?.travel;
  const travelChanged = travel?.amount !== previousTravel?.amount || travel?.currency !== previousTravel?.currency;
  return normalizeTripBudget({
    costs,
    travelHomeBase: travel && (travelChanged || fields.has("confirm-travel-base") ? homeBaseId : previous?.travelHomeBase),
    walkAway: readBudgetMoney(fields, "walkAway"),
    nights: count("nights"),
    mealDays: count("mealDays"),
    custom: customIds.map((id) => ({
      id, label: fields.get(`custom-${id}-label`), ...readBudgetMoney(fields, `custom-${id}`),
    })),
  });
}
