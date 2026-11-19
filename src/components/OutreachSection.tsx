import { useState } from "react";
import { mergeOutreach, outreachContactHref } from "../data";
import {
  emptyOutreach,
  outreachMethods,
  outreachStatuses,
  type Outreach,
  type OutreachPatch,
  type OutreachStatus,
} from "../model";
import { localDate } from "../utils";
import { outreachMethodLabels, outreachStatusLabels } from "./OutreachChip";

const knownMethods = {
  email: "email",
  form: "form",
  DM: "instagram_dm",
  none: null,
} as const;
const editableFields = [
  "status", "method", "contact", "contacted_at", "response_at", "quoted_price", "notes",
] as const;

export function OutreachSection({
  outreach = emptyOutreach,
  knownOutreach,
  onSave,
  saved,
}: {
  outreach?: Outreach;
  knownOutreach?: Outreach | null;
  onSave: (patch: OutreachPatch) => void;
  saved: boolean;
}) {
  const [draft, setDraft] = useState(outreach);
  const [submitted, setSubmitted] = useState(false);
  const knownContact = knownOutreach?.contact ?? null;
  const knownMethod = knownMethods[knownOutreach?.contact_type ?? "none"];
  const href = outreachContactHref(knownContact);
  const contact = draft.contact?.trim() || null;
  const contactIsInvalid = contact !== null && !outreachContactHref(contact);
  const changes = editableFields.filter((field) =>
    (field === "contact" ? contact : draft[field]) !== outreach[field],
  );
  function update(patch: OutreachPatch) {
    setDraft((current) => mergeOutreach(current, patch));
    setSubmitted(false);
  }
  function changeStatus(status: OutreachStatus) {
    const firstOutreach = draft.status === "not_contacted" && status !== "not_contacted";
    update({
      status,
      ...(firstOutreach && {
        method: knownMethod,
        contact: contact ?? knownContact,
      }),
      ...(status === "contacted" && !draft.contacted_at && { contacted_at: localDate() }),
      ...(["replied", "quoted", "declined"].includes(status) && { response_at: localDate() }),
    });
  }
  return (
    <section className="outreach-section" aria-labelledby="outreach-heading">
      <h2 id="outreach-heading">Outreach</h2>
      <dl>
        <div className="detail-row">
          <dt>Known contact route</dt>
          <dd>
            {href ? (
              <a href={href} target={href.startsWith("mailto:") ? undefined : "_blank"} rel="noreferrer">
                {knownMethod && outreachMethodLabels[knownMethod] + " · "}{knownContact}
              </a>
            ) : "No known contact route"}
          </dd>
        </div>
        {(outreach.published_booth_price || outreach.price_source_url) && (
          <div className="detail-row">
            <dt>Published booth price</dt>
            <dd>
              {outreach.published_booth_price || "No published price found"}
              {outreach.price_source_url && (
                <a className="outreach-price-source" href={outreach.price_source_url} target="_blank" rel="noreferrer">
                  Price source
                </a>
              )}
            </dd>
          </div>
        )}
        {outreach.message_ref && (
          <div className="detail-row">
            <dt>Message reference</dt>
            <dd>{outreach.message_ref}</dd>
          </div>
        )}
      </dl>
      <form className="outreach-form" onSubmit={(event) => {
        event.preventDefault();
        if (contactIsInvalid || !changes.length) return;
        onSave(Object.fromEntries(changes.map((field) => [
          field, field === "contact" ? contact : draft[field],
        ])));
        setSubmitted(true);
      }}>
        <label>
          Outreach status
          <select value={draft.status} onChange={(event) => changeStatus(event.target.value as OutreachStatus)}>
            {outreachStatuses.map((status) =>
              <option key={status} value={status}>{outreachStatusLabels[status]}</option>,
            )}
          </select>
        </label>
        <label>
          Outreach method
          <select value={draft.method ?? ""} disabled={draft.status === "not_contacted"}
            onChange={(event) => update({ method: (event.target.value || null) as Outreach["method"] })}>
            <option value="">Choose method</option>
            {outreachMethods.map((method) =>
              <option key={method} value={method}>{outreachMethodLabels[method]}</option>,
            )}
          </select>
        </label>
        <label className="outreach-wide">
          Contact address or URL
          <input value={draft.contact ?? ""} autoCapitalize="off" spellCheck={false}
            aria-invalid={contactIsInvalid || undefined}
            aria-describedby={contactIsInvalid ? "outreach-save-status" : undefined}
            onChange={(event) => update({ contact: event.target.value || null })} />
        </label>
        <label>
          Contacted on
          <input type="date" min="0001-01-01" max="9999-12-31" value={draft.contacted_at ?? ""}
            onChange={(event) => update({ contacted_at: event.target.value || null })} />
        </label>
        <label>
          Response date
          <input type="date" min="0001-01-01" max="9999-12-31" value={draft.response_at ?? ""}
            onChange={(event) => update({ response_at: event.target.value || null })} />
        </label>
        <label className="outreach-wide">
          Quoted price
          <input value={draft.quoted_price ?? ""}
            onChange={(event) => update({ quoted_price: event.target.value || null })} />
        </label>
        <label className="outreach-wide">
          Outreach notes
          <textarea rows={3} value={draft.notes}
            onChange={(event) => update({ notes: event.target.value })} />
        </label>
        <div className="outreach-actions outreach-wide">
          <button type="submit" className="button" aria-disabled={!changes.length || contactIsInvalid}>
            Save outreach
          </button>
          <small role="status" id="outreach-save-status">
            {contactIsInvalid
              ? "Enter an email address or a web URL."
              : changes.length
                ? "Unsaved changes"
                : submitted && (saved ? "Saved on this device" : "Export a backup to keep your edits")}
          </small>
        </div>
      </form>
      {outreach.research_notes && (
        <details className="outreach-research">
          <summary>Research notes</summary>
          <p>{outreach.research_notes}</p>
        </details>
      )}
    </section>
  );
}
