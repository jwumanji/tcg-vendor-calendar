import type { Event, VendorOption } from "./model.ts";

// Local units per USD. The research snapshot is dated 2026-11-20.
const fx: Record<string, number> = {
  SGD: 1.290845,
  AED: 3.6725,
  VND: 25729.721904,
  THB: 33.94469,
  HKD: 7.844282,
  AUD: 1.498714,
  USD: 1,
  // Retain the existing estimates for currencies outside the snapshot.
  MYR: 1 / 0.23,
  IDR: 1 / 0.000063,
  CNY: 1 / 0.14,
  SAR: 1 / 0.267,
  PHP: 1 / 0.017,
  QAR: 1 / 0.275,
  KWD: 1 / 3.25,
  BHD: 1 / 2.65,
};
const aliases: Record<string, string> = {
  HK$: "HKD",
  S$: "SGD",
  US$: "USD",
  RM: "MYR",
  RP: "IDR",
};
export function parseBoothCost(text?: string | null) {
  if (!text || /sponsorship packages/i.test(text)) return null;
  // Read the first base price from older vendor_cost text. The caller checks applicability.
  const price =
    /\b(HK\$|US\$|S\$|SGD|HKD|MYR|THB|IDR|USD|AED|AUD|CNY|SAR|PHP|VND|QAR|KWD|BHD|RM|Rp\.?)\s*(\d[\d,]*(?:\.\d+)?)/gi;
  for (const match of text.matchAll(price)) {
    const before = text.slice(0, match.index).split(/[;:]/).pop() ?? "";
    const after = text.slice(match.index + match[0].length);
    if (
      /\+\s*$|(?:extra (?:staff pass|badges?)|artist alley|deposit|selection fee)\s*$/i.test(
        before,
      ) ||
      /^\s*(?:deposit|service fee|\/sqm)\b/i.test(after)
    )
      continue;
    const code = match[1].toUpperCase().replace(".", "");
    const currency = aliases[code] ?? code;
    const amount = Number(match[2].replaceAll(",", ""));
    if (Number.isFinite(amount)) {
      // Scope years to the selected price, excluding separate alternatives
      // and statements about an edition whose rates have yet to be published.
      const prefix = text.slice(0, match.index).split(/[;.]/).at(-1) ?? "";
      const suffix = after.split(/[;.]/)[0];
      const year = suffix.match(/^\s*\((20\d\d)\)|^.{0,40}?\b(?:was (?:the )?|for )(20\d\d)\b/i)
        ?? prefix.match(/\b(20\d\d)\b(?!.*\b20\d\d\b)(?![^:]*not published)/i);
      const quoteYear = year ? Number(year[1] ?? year[2]) : null;
      return { amount, currency, approxUsd: amount / fx[currency], note: text, quoteYear };
    }
  }
  return null;
}

export function optionRateStatus(option: VendorOption, now: number): VendorOption["rate_status"] {
  return option.rate_status === "current" && option.valid_until && now >= Date.parse(option.valid_until)
    ? "expired"
    : option.rate_status;
}

export function legacyVendorPrice(event: Event) {
  const cost = parseBoothCost(event.vendor_cost);
  if (!cost) return null;
  const year = Number((event.start_date ?? event.estimated_month)?.slice(0, 4)
    ?? event.name.match(/\b(20\d\d)\b/)?.[1]);
  const status: VendorOption["rate_status"] =
    (cost.quoteYear !== null && cost.quoteYear < year) ||
    /\b(?:prior|past|previous|last)[ -](?:edition|year)|historical rate/i.test(cost.note) ? "past_year"
      : /\bexpired\b|early[ -]bird (?:has )?(?:ended|closed)/i.test(cost.note) ? "expired"
        : /\bunverified\b|\bunconfirmed\b|not (?:verified|(?:a )?confirmed|published|for resale)|agent price|\bineligible\b|does not apply|(?:artists?|creators?) only/i.test(cost.note) ? "unavailable"
          : "current";
  return { ...cost, status };
}

export type ApplicableVendorPrice =
  | { basis: VendorOption["basis"]; amount: number; currency: string; usd: number; option: VendorOption }
  | { basis: "listed"; amount: number; currency: string; usd: number; note: string };

export function applicableVendorPrice(event: Event, now: number): ApplicableVendorPrice | null {
  if (event.event_status === "cancelled") return null;
  let best: VendorOption | undefined;
  for (const option of event.vendor_options ?? []) {
    if (option.kind !== "package" || option.eligibility !== "eligible" || optionRateStatus(option, now) !== "current")
      continue;
    if (!best || (option.basis === "quote" && best.basis === "published") ||
        (option.basis === best.basis && option.usd_amount < best.usd_amount)) best = option;
  }
  if (best)
    return { basis: best.basis, option: best, amount: best.amount_incl_vat ?? best.amount, currency: best.currency, usd: best.usd_amount };

  const listed = legacyVendorPrice(event);
  // A feed may still carry the same rate that an itemized record disqualifies.
  const duplicatesItemizedRate = listed && event.vendor_options?.some((option) =>
    option.currency === listed.currency && (option.amount === listed.amount || option.amount_incl_vat === listed.amount));
  if (listed?.status === "current" && !duplicatesItemizedRate)
    return { basis: "listed", amount: listed.amount, currency: listed.currency, usd: listed.approxUsd, note: listed.note };
  return null;
}

const localNumber = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const usdNumber = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const formatVendorAmount = (amount: number, currency: string) => `${currency} ${localNumber.format(amount)}`;
export const formatVendorUsd = (amount: number) => `USD ${usdNumber.format(amount)}`;
