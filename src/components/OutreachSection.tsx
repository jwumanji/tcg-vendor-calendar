import { useState, type Ref } from "react";
import { hasOutreachResponse, outreachContactHref, outreachExchangeFields, recordOutreachExchange } from "../data";
import {
  emptyOutreach,
  outreachMethods,
  outreachStatuses,
  type Outreach,
  type OutreachPatch,
  type OutreachStatus,
} from "../model";
import { followUp, followUpDays, followUpKind, followUpLabels } from "../outreach";
import { outreachMethodLabels, outreachStatusLabels } from "./OutreachChip";
import { isApplyPurpose, routeAction, waitingDays, type vendorRoutes } from "../eventDecision";
import { prettyDate, safeUrl } from "../utils";
import { ApplyLink } from "./ApplyLink";

const knownMethods = {
  email: "email",
  form: "form",
  DM: "instagram_dm",
  none: null,
} as const;
const editableFields = [
  ...outreachExchangeFields, "method", "contact", "quoted_price", "notes",
] as const;

const hasReply = (status: OutreachStatus) => status === "replied" || status === "quoted";

export function OutreachSection({
  outreach = emptyOutreach,
  knownOutreach,
  eventContacts,
  onSave,
  saved,
  today,
  routes,
  editor,
}: {
  outreach?: Outreach;
  knownOutreach?: Outreach | null;
  eventContacts: (string | null)[];
  onSave: (patch: OutreachPatch) => void;
  saved: boolean;
  today: string;
  routes: ReturnType<typeof vendorRoutes>;
  editor: Ref<HTMLDetailsElement>;
}) {
  const [edits, setEdits] = useState<OutreachPatch>({});
  const [submitted, setSubmitted] = useState(false);
  const knownContact = knownOutreach?.contact ?? routes.contact?.label;
  const contactHref = outreachContactHref(knownContact);
  const knownType = knownOutreach?.contact ? knownOutreach.contact_type : null;
  const knownMethod = knownMethods[knownType ?? "none"] ?? (
    contactHref?.startsWith("mailto:") ? "email" : null
  );
  const status = edits.status ?? outreach.status;
  const recording = status !== "not_contacted";
  const changingStatus = status !== outreach.status;
  const changingResponse = hasOutreachResponse(status) && edits.response_at !== undefined &&
    edits.response_at !== outreach.response_at;
  const changingMessage = recording && edits.message_ref !== undefined && edits.message_ref !== outreach.message_ref;
  const changingContactDate = status === "contacted" && edits.contacted_at !== undefined &&
    edits.contacted_at !== outreach.contacted_at;
  const changingExchange = changingStatus || changingResponse || changingMessage || changingContactDate;
  const patch = {
    ...(changingStatus && {
      response_at: hasOutreachResponse(status) ? today : null,
    }),
    ...((changingStatus || changingResponse) && { message_ref: null }),
    ...(recording && changingStatus && {
      method: outreach.method ?? knownMethod,
      contact: outreach.contact ?? (contactHref ? knownContact ?? null : null),
      ...(status === "contacted" && !outreach.contacted_at && { contacted_at: today }),
    }),
    ...edits,
  };
  const draft = changingExchange ? recordOutreachExchange(outreach, patch) : { ...outreach, ...patch };
  const contact = draft.contact?.trim() || null;
  const contactIsInvalid = contact !== null && !outreachContactHref(contact);
  const values = { ...draft, contact, method: recording ? draft.method : null };
  const action = followUpKind(values);
  const reminder = followUp(values);
  const changes = new Set<keyof Outreach>(editableFields.filter((field) => values[field] !== outreach[field]));
  function update(patch: OutreachPatch) {
    setEdits((current) => ({ ...current, ...patch }));
    setSubmitted(false);
  }
  const waiting = waitingDays(outreach, today);
  const lastActivity = [
    { date: outreach.response_at, label: "Reply" },
    { date: outreach.acknowledgement_at, label: "Automatic acknowledgement" },
    { date: outreach.contacted_at, label: "Contacted" },
  ].filter(({ date }) => date).sort((a, b) => b.date!.localeCompare(a.date!))[0];
  const method = outreach.method ?? (outreach.status !== "not_contacted" ? knownMethod : null);
  const listedRoutes = [...new Map([routes.contact, routes.application, ...routes.alternatives]
    .flatMap((route) => route ? [[route.href, route] as const] : [])).values()];
  const instructions = [...new Set(eventContacts.filter((text): text is string => Boolean(text?.trim())))]
    .filter((text) => !listedRoutes.some(({ label }) => label === text.trim()));
  return (
    <section className="outreach-section" aria-labelledby="outreach-heading">
      <h2 id="outreach-heading" className="sr-only">Outreach</h2>
      <div className="outreach-summary">
        <strong>{outreachStatusLabels[outreach.status]}</strong>
        {method && <span>{outreachMethodLabels[method]}</span>}
        {lastActivity && <span>{lastActivity.label} · <time dateTime={lastActivity.date!}>{prettyDate(lastActivity.date!)}</time></span>}
        {waiting !== undefined && <span>Waiting {waiting} {waiting === 1 ? "day" : "days"}</span>}
      </div>
      {outreach.quoted_price && <p className="outreach-quote">Logged quote · {outreach.quoted_price}</p>}
      {outreach.notes && (/do not (?:auto[- ]?)?reply/i.test(outreach.notes)
        ? <p className="outreach-log-note">{outreach.notes}</p>
        : <details className="outreach-exchange">
          <summary>Exchange notes</summary>
          <p className="outreach-log-note">{outreach.notes}</p>
        </details>)}
      {outreach.acknowledgement_at && lastActivity?.label !== "Automatic acknowledgement" &&
        <p>Automatic acknowledgement · <time dateTime={outreach.acknowledgement_at}>{prettyDate(outreach.acknowledgement_at)}</time></p>}
      <details ref={editor} className="outreach-edit">
        <summary>Edit <span className="sr-only">outreach</span></summary>
        <form className="outreach-form" onSubmit={(event) => {
          event.preventDefault();
          if (contactIsInvalid || !changes.size) return;
          // Date changes, status and reminder edits need the exchange they belong to in the saved overlay.
          if (outreachExchangeFields.some((field) => changes.has(field))) {
            for (const field of outreachExchangeFields) changes.add(field);
          }
          onSave(Object.fromEntries([...changes].map((field) => [field, values[field]])));
          setEdits({});
          setSubmitted(true);
        }}>
          <label>
            Outreach status
            <select value={status} onChange={(event) => update({ status: event.target.value as OutreachStatus })}>
              {outreachStatuses.map((status) =>
                <option key={status} value={status}>{outreachStatusLabels[status]}</option>,
              )}
            </select>
          </label>
          <label>
            Outreach method
            <select value={values.method ?? ""} disabled={!recording}
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
              disabled={!hasOutreachResponse(status)}
              onChange={(event) => update({ response_at: event.target.value || null })} />
          </label>
          <label>
            Next action
            <select value={hasReply(status) ? draft.next_action ?? "" : ""} disabled={!hasReply(status)}
              onChange={(event) => update(event.target.value
                ? { next_action: "reply_to_organizer" }
                : { next_action: null, follow_up_due_at: null })}>
              <option value="">{status === "contacted" ? followUpLabels.nudge : "No follow-up"}</option>
              <option value="reply_to_organizer">{followUpLabels.reply}</option>
            </select>
          </label>
          <label>
            Follow-up due date
            <input type="date" min="0001-01-01" max="9999-12-31" disabled={!action}
              value={action ? draft.follow_up_due_at ?? "" : ""} aria-describedby={action ? "outreach-due-help" : undefined}
              onChange={(event) => update({ follow_up_due_at: event.target.value || null })} />
          </label>
          {action && (
            <p className="outreach-wide outreach-due-help" id="outreach-due-help">
              {reminder
                ? <>{followUpLabels[action]} <time dateTime={reminder.due}>{reminder.due}</time>.</>
                : action === "reply" ? "Set a response date or a follow-up due date."
                  : `Set a contact date for a reminder in ${followUpDays} calendar days, or choose a due date.`}
            </p>
          )}
          <label className="outreach-wide">
            Message reference
            <input value={draft.message_ref ?? ""} autoCapitalize="off" spellCheck={false}
              onChange={(event) => update({ message_ref: event.target.value || null })} />
          </label>
          <label className="outreach-wide">
            Quoted price
            <input value={draft.quoted_price ?? ""} aria-describedby="outreach-price-help"
              onChange={(event) => update({ quoted_price: event.target.value || null })} />
          </label>
          <p className="outreach-wide outreach-due-help" id="outreach-price-help">
            Saving this text only updates Outreach. To use a quote in the budget and walk-away comparison, add a booth option in Money and select the organizer quote price type.
          </p>
          <label className="outreach-wide">
            Outreach notes
            <textarea rows={3} value={draft.notes}
              onChange={(event) => update({ notes: event.target.value })} />
          </label>
          <div className="outreach-actions outreach-wide">
            <button type="submit" className="button" aria-disabled={!changes.size || contactIsInvalid}>
              Save outreach
            </button>
            <small role="status" id="outreach-save-status">
              {contactIsInvalid
                ? "Enter an email address or a web URL."
                : changes.size
                  ? "Unsaved changes"
                  : submitted && (saved ? "Saved on this device" : "Export a backup to keep your edits")}
            </small>
          </div>
        </form>
      </details>
      {(listedRoutes.length > 0 || instructions.length > 0 || outreach.research_notes) && (
        <details className="outreach-research">
          <summary>Contacts and instructions</summary>
          <ul>
            {listedRoutes.map((route) => (
              <li key={route.href}>
                {isApplyPurpose(route.purpose) ? <ApplyLink action={routeAction(route)} compact />
                  : <a href={route.href} target={safeUrl(route.href) ? "_blank" : undefined} rel="noreferrer">{route.label}</a>}
              </li>
            ))}
            {instructions.map((text) => <li key={text}>{text}</li>)}
          </ul>
          {outreach.research_notes && <p>{outreach.research_notes}</p>}
        </details>
      )}
    </section>
  );
}
