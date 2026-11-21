import type { Event } from "../model";
import { applicableVendorPrice, formatVendorAmount, formatVendorUsd } from "../vendorPricing";

const basisLabels = { quote: "quote", published: "published", listed: "est." };

export function VendorPriceCue({ event, now }: { event: Event; now: number }) {
  const price = applicableVendorPrice(event, now);
  if (!price) return null;
  const local = formatVendorAmount(price.amount, price.currency);
  const description = price.basis === "listed" ? "Listed booth price" : price.option.name;
  return (
    <span className="vendor-price-cue" title={description + " · " + local}>
      Booth {basisLabels[price.basis]} · {formatVendorUsd(price.usd)}
    </span>
  );
}
