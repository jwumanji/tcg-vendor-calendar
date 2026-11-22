import { useEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { ArrowUpRight, Pencil, Plus } from "lucide-react";
import { normalizeVendorDocument, normalizeVendorOption } from "../data";
import {
  vendorEligibilities, vendorRateStatuses, type Event, type VendorDocument, type VendorOption, type VendorPricingPatch,
} from "../model";
import { prettyDate, safeUrl } from "../utils";
import { applicableVendorPrice, formatVendorAmount, formatVendorUsd, legacyVendorPrice, missingPriceMessage, optionRateStatus, snapshotCurrencies } from "../vendorPricing";
import { Modal } from "./Modal";

type Editing = { type: "option"; item?: VendorOption } | { type: "document"; item?: VendorDocument };
const eligibilityLabels: Record<VendorOption["eligibility"], string> = {
  eligible: "Eligible",
  ineligible: "Ineligible",
  unclear: "Unclear",
};
const rateLabels: Record<VendorOption["rate_status"], string> = {
  current: "Current",
  past_year: "Past-year rate",
  expired: "Expired rate",
  unavailable: "Rate unavailable",
};
const pricingLabels = { quote: "Organizer quote", published: "Published price", listed: "Listed price · estimated USD" };
function Source({ source, label }: { source: string; label?: string }) {
  return safeUrl(source) ? <a href={source} target="_blank" rel="noreferrer">{label ?? source}</a> : <span>{source}</span>;
}

export function Cutoff({ until }: { until: string }) {
  const zone = until.endsWith("Z") ? "UTC" : "UTC" + until.slice(-6);
  return <time dateTime={until}>{prettyDate(until.slice(0, 10))}, {until.slice(11, 16)} {zone}</time>;
}

function Cell({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return <td role="cell" className={className}><span className="money-cell-label" aria-hidden="true">{label}</span>{children}</td>;
}

export function VendorMoney({ event, now, shared, local, onSave, onRemove, terms }: {
  event: Event;
  now: number;
  shared?: VendorPricingPatch;
  terms?: string | null;
  local?: VendorPricingPatch;
  onSave?: (patch: VendorPricingPatch) => void;
  onRemove?: (field: keyof VendorPricingPatch, id: string) => void;
}) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const addOption = useRef<HTMLButtonElement>(null);
  const addDocument = useRef<HTMLButtonElement>(null);
  const options = event.vendor_options ?? [];
  const docs = event.vendor_documents ?? [];
  const price = applicableVendorPrice(event, now);
  const selected = price && price.basis !== "listed" ? price.option.id : null;
  const legacy = legacyVendorPrice(event);
  const sources = [...new Map(options.map((option) => [option.source, option.basis]))];
  const conversions = [...new Map(options.map((option) => [
    JSON.stringify([option.currency, option.fx_as_of, option.fx_rate, option.fx_source]), option,
  ])).values()];

  function actions(edit: Editing & { item: VendorOption | VendorDocument }, label: string, add: RefObject<HTMLButtonElement | null>) {
    if (!onSave) return null;
    const field = edit.type === "option" ? "vendor_options" : "vendor_documents";
    const id = edit.item.id;
    const edited = local?.[field]?.some((row) => row.id === id);
    const seeded = shared?.[field]?.some((row) => row.id === id);
    const reset = seeded ? "Reset to shared" : "Delete local";
    return (
      <div className="money-item-actions">
        <button type="button" className="button" aria-label={`Edit ${label}`} aria-haspopup="dialog" onClick={() => setEditing(edit)}>
          <Pencil size={14} aria-hidden="true" /> Edit
        </button>
        {edited && onRemove && (
          <button type="button" className="button" aria-label={`${reset} ${label}`} onClick={(e) => {
            const target = seeded ? e.currentTarget.previousElementSibling as HTMLElement : add.current;
            target?.focus();
            onRemove(field, id);
          }}>{reset}</button>
        )}
      </div>
    );
  }

  return (
    <section className="vendor-money" aria-labelledby="vendor-money-title">
      <h2 id="vendor-money-title">Money</h2>
      <div className="money-summary">
        {price ? (
          <>
            <span className="money-summary-label">Applicable booth price</span>
            <strong>{formatVendorAmount(price.amount, price.currency)} <span>· {formatVendorUsd(price.usd)}</span></strong>
            <p>{price.basis !== "listed" && <>{price.option.name}{price.option.vat_rate !== undefined && " incl. VAT"} · </>}{pricingLabels[price.basis]}</p>
          </>
        ) : <p>{missingPriceMessage(event, now)}</p>}
      </div>
      {event.vendor_cost && (!options.length || price?.basis === "listed" || legacy && legacy.status !== "current") && (
        <p className="money-reference">
          <strong>{legacy && legacy.status !== "current" ? rateLabels[legacy.status] : "Listed vendor information"}</strong>
          {" · "}{event.vendor_cost}
        </p>
      )}
      {terms && <p className="money-reference"><strong>Booth terms</strong> · {terms}</p>}
      {event.outreach?.published_booth_price && event.outreach.published_booth_price !== event.vendor_cost && (
        <p className="money-reference"><strong>Outreach research reference</strong> · {event.outreach.published_booth_price}</p>
      )}
      {event.outreach?.price_source_url && (
        <p className="money-reference"><Source source={event.outreach.price_source_url} label="Outreach price source" /></p>
      )}
      {options.length > 0 && (
        <>
          <div className="money-table-scroll">
            <table className="money-table" role="table" aria-label="Booth and table options">
              <thead role="rowgroup"><tr role="row">
                {["Option", "Size", "Includes", "Original price", "USD", "TCG singles", "Notes"].map((label) =>
                  <th key={label} role="columnheader" scope="col">{label}</th>)}
              </tr></thead>
              <tbody role="rowgroup">
                {options.map((option) => {
                  const status = optionRateStatus(option, now);
                  const statusLabel = status === "expired" && option.early_bird ? "Expired early bird" : rateLabels[status];
                  return (
                    <tr role="row" key={option.id} data-applicable={selected === option.id}
                      data-inactive={option.eligibility === "ineligible" || status === "expired" || status === "past_year"}>
                      <th role="rowheader" scope="row">
                        <span className="money-option-name">{option.name}</span>
                        <div className="money-tags">
                          {selected === option.id && <span className="money-tag" data-applicable="true">Applicable</span>}
                          {option.kind === "add_on" && <span className="money-tag">Add-on</span>}
                          {status !== "current" && <span className="money-tag">{statusLabel}</span>}
                        </div>
                        {actions({ type: "option", item: option }, option.name, addOption)}
                      </th>
                      <Cell label="Size">{option.size || "Size not listed"}</Cell>
                      <Cell label="Includes">{option.includes || "Inclusions not listed"}</Cell>
                      <Cell label="Original price" className="money-amount">
                        <span>{formatVendorAmount(option.amount, option.currency)}</span>
                        {option.amount_incl_vat !== undefined && <small>{formatVendorAmount(option.amount_incl_vat, option.currency)} incl. VAT</small>}
                      </Cell>
                      <Cell label="USD" className="money-amount">{formatVendorUsd(option.usd_amount)}</Cell>
                      <Cell label="TCG singles">
                        {option.kind === "add_on" && option.eligibility === "eligible" ? "Add-on" : eligibilityLabels[option.eligibility]}
                      </Cell>
                      <Cell label="Notes">
                        {option.notes}
                        {option.valid_until && <small className="money-cutoff">{status === "expired" ? "Cutoff was " : "Rate until "}<Cutoff until={option.valid_until} /></small>}
                        {!option.notes && !option.valid_until && "No additional terms"}
                      </Cell>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <details className="money-sources">
            <summary>Price sources and FX</summary>
            <ul>
              {sources.map(([source, basis]) => <li key={source}><Source source={source} label={pricingLabels[basis]} /></li>)}
              {conversions.map(({ currency, fx_rate, fx_as_of, fx_source, id }) => (
                <li key={id}>1 USD = {fx_rate} {currency} · {prettyDate(fx_as_of)} · <Source source={fx_source} label="FX source" /></li>
              ))}
            </ul>
          </details>
        </>
      )}
      {onSave && (
        <button className="button" ref={addOption} onClick={() => setEditing({ type: "option" })} aria-haspopup="dialog">
          <Plus size={15} aria-hidden="true" /> Add booth option
        </button>
      )}
      {(docs.length > 0 || onSave) && (
        <div className="money-documents">
          {docs.length > 0 && (
            <>
              <h3>Vendor documents</h3>
              <ul>{docs.map((doc) => (
                <li key={doc.id}>
                  <a className="money-file" href={import.meta.env.BASE_URL + doc.path} target="_blank" rel="noreferrer">
                    {doc.label} <ArrowUpRight size={15} aria-hidden="true" />
                  </a>
                  <div className="money-document-meta">
                    <time dateTime={doc.received_at}>Received {prettyDate(doc.received_at)}</time>
                    <Source source={doc.source} label={doc.source.includes("drive.google.com") ? "Full proposal source" : "Source"} />
                  </div>
                  {doc.notes && <p>{doc.notes}</p>}
                  {actions({ type: "document", item: doc }, doc.label, addDocument)}
                </li>
              ))}</ul>
            </>
          )}
          {onSave && (
            <button className="button" ref={addDocument} onClick={() => setEditing({ type: "document" })} aria-haspopup="dialog">
              <Plus size={15} aria-hidden="true" /> Add document link
            </button>
          )}
        </div>
      )}
      {editing && onSave && <VendorEditor editing={editing} close={() => setEditing(null)} save={(patch) => {
        onSave(patch);
        setEditing(null);
      }} />}
    </section>
  );
}

export function VendorEditor({ editing, close, save }: { editing: Editing; close: () => void; save: (patch: VendorPricingPatch) => void }) {
  const [error, setError] = useState<{ message: string }>();
  const saveError = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) saveError.current?.scrollIntoView({ block: "nearest" });
  }, [error]);
  const option = editing.type === "option" ? editing.item : undefined;
  const doc = editing.type === "document" ? editing.item : undefined;
  const typeLabel = editing.type === "option" ? "booth option" : "document link";
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    const id = editing.item?.id ?? crypto.randomUUID();
    try {
      if (editing.type === "document") {
        save({ vendor_documents: [normalizeVendorDocument({ ...fields, id, path: "vendor-docs/" + fields.filename.trim() })] });
        return;
      }
      const amount = Number(fields.amount);
      const fx_rate = Number(fields.fx_rate);
      const vat_rate = fields.vat ? Number(fields.vat) / 100 : undefined;
      const amount_incl_vat = vat_rate === undefined ? undefined : Math.round(amount * (1 + vat_rate) * 100) / 100;
      const currency = fields.currency.trim().toUpperCase();
      save({ vendor_options: [normalizeVendorOption({
        ...fields, id, amount, fx_rate, vat_rate, amount_incl_vat, currency,
        early_bird: fields.early_bird === "on" || undefined,
        valid_until: fields.valid_until.trim() || undefined,
      })] });
    } catch (err) {
      setError({ message: (err as Error).message });
    }
  }
  return (
    <Modal title={(editing.item ? "Edit " : "Add ") + typeLabel} titleId="vendor-editor-title" closeLabel="Close vendor editor"
      close={close} className="money-editor">
      <form className="outreach-form money-form" onSubmit={submit}>
        {editing.type === "document" ? (
          <>
            <label className="outreach-wide">Label<input name="label" required defaultValue={doc?.label} /></label>
            <label className="outreach-wide">Published filename<input name="filename" required defaultValue={doc?.path.split("/").at(-1)}
              aria-describedby="vendor-file-help" placeholder="vendor-pack.pdf" /></label>
            <p className="outreach-wide" id="vendor-file-help">Use a PDF or image already published under <code>vendor-docs/</code>.</p>
            <label>Received date<input name="received_at" required type="date" defaultValue={doc?.received_at} /></label>
            <label>Source<input name="source" required defaultValue={doc?.source} /></label>
            <label className="outreach-wide">Document type<select name="kind" defaultValue={doc?.kind ?? "reference"}>
              <option value="reference">Reference document</option>
              <option value="organizer_proposal">Organizer proposal for this edition</option>
            </select></label>
            <label className="outreach-wide">Notes<textarea name="notes" rows={2} defaultValue={doc?.notes} /></label>
          </>
        ) : (
          <>
            <label>Option name<input name="name" required defaultValue={option?.name} /></label>
            <label>Size<input name="size" defaultValue={option?.size} /></label>
            <label className="outreach-wide">Includes<textarea name="includes" rows={2} defaultValue={option?.includes} /></label>
            <label>Original amount<input name="amount" type="number" required min="0" step="0.01" defaultValue={option?.amount} /></label>
            <label>Currency code<input name="currency" maxLength={3} required defaultValue={option?.currency}
              placeholder="SGD" aria-describedby="vendor-fx-help" /></label>
            <label>VAT to add (%)<input name="vat" type="number" min="0" max="100" step="any"
              defaultValue={option?.vat_rate === undefined ? undefined : option.vat_rate * 100} /></label>
            <label>FX rate (local units per USD)<input name="fx_rate" type="number" min="0" step="any" required defaultValue={option?.fx_rate} /></label>
            <label>FX as of<input name="fx_as_of" type="date" required defaultValue={option?.fx_as_of} /></label>
            <label className="outreach-wide">FX source<input name="fx_source" required defaultValue={option?.fx_source} /></label>
            <p className="outreach-wide" id="vendor-fx-help">
              The option row uses the dated FX rate for USD. Package comparisons and budget totals use the snapshot for {snapshotCurrencies}.
            </p>
            <label>Kind<select name="kind" defaultValue={option?.kind}>
              <option value="package">Package</option><option value="add_on">Add-on</option>
            </select></label>
            <label>TCG singles eligibility<select name="eligibility" defaultValue={option?.eligibility ?? "unclear"}>
              {vendorEligibilities.map((value) => <option value={value} key={value}>{eligibilityLabels[value]}</option>)}
            </select></label>
            <label>Price type<select name="basis" defaultValue={option?.basis}>
              <option value="quote">This-edition organizer quote</option><option value="published">Published price</option>
            </select></label>
            <label>Rate status<select name="rate_status" defaultValue={option?.rate_status}>
              {vendorRateStatuses.map((value) => <option value={value} key={value}>{rateLabels[value]}</option>)}
            </select></label>
            <label className="outreach-wide">Price source<input name="source" required defaultValue={option?.source} /></label>
            <label>Cutoff with UTC offset<input name="valid_until" defaultValue={option?.valid_until} placeholder="2027-01-29T23:00+10:00" /></label>
            <label className="money-check"><input name="early_bird" type="checkbox" defaultChecked={option?.early_bird} /> Early-bird rate</label>
            <label className="outreach-wide">Notes<textarea name="notes" rows={3} defaultValue={option?.notes} /></label>
          </>
        )}
        {error && <p ref={saveError} className="outreach-wide" role="alert">{error.message}</p>}
        <div className="money-item-actions outreach-wide">
          <button className="button primary" type="submit">Save {typeLabel}</button>
          <button className="button" type="button" onClick={close}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
