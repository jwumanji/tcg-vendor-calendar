import { GoingButton, type SetGoing } from "./GoingButton";
import { PriorityDetail } from "./PriorityDetail";
import { FindBadges, FindDetails } from "./FindSource";
import type { ScoreResult } from "../scoring";
import { decisionReason, isApplyPurpose, nextVendorAction, routeAction, saigonDay, vendorApplyAction, vendorRoutes, vendorTiming, type goingConflicts } from "../eventDecision";
import { homeBaseLabel, resolveHomeBase } from "../homeBase";
import { applicableVendorPrice, formatVendorAmount, legacyVendorPrice } from "../vendorPricing";
import { eventPath } from "../route";
import { flushSync } from "react-dom";
import React, { useRef, useEffect, useState, useCallback } from "react";
import { useMediaQuery } from "../hooks/useMediaQuery";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Instagram,
  LoaderCircle,
  Download,
} from "lucide-react";
import type { BudgetDefaults, TripBudget as Budget, Event, VendorMilestone, VendorPricingPatch } from "../model";
import {
  displayDateLabel,
  safeUrl,
  ranges,
  prettyDate,
  ics,
  download,
  gameKeyOf,
  primaryGameKey,
  hasConfirmedDates,
} from "../utils";
import { Logo, Status, Place } from "./EventIdentity";
import { StagePicker } from "./Pipeline";
import { ApplyLink } from "./ApplyLink";
import type { DisplayEntry, Stage } from "../storage";
import type { Outreach, OutreachPatch } from "../model";
import { PriorityChip } from "./PriorityChip";
import { OutreachSection } from "./OutreachSection";
import { BookingMilestones } from "./BookingMilestones";
import { Cutoff, VendorEditor, VendorMoney } from "./VendorMoney";
import { TripBudget } from "./TripBudget";
import { calculateTripBudget } from "../tripBudget";
import { outreachStatusLabels } from "./OutreachChip";
import { MilestoneTimes } from "./UpcomingMilestones";

function meaningful(value?: string | number | null) {
  const text = value == null ? "" : String(value).trim();
  return text && !/^(?:unknown|tba|tbd|other|unspecified|[-—–])$/i.test(text) ? text : undefined;
}

const areaLabels: Record<string, string> = {
  "SEA/HK": "Southeast Asia and Hong Kong",
  "GCC (other)": "Other Gulf countries",
  UAE: "United Arab Emirates",
};
function DetailDisclosure({ label, hint, defaultOpen, children, disclosureRef }: {
  label: string;
  hint: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  disclosureRef?: React.Ref<HTMLDetailsElement>;
}) {
  // Freeze the initial attribute so native toggles and focus reveals survive edits.
  const [initialOpen] = useState(defaultOpen);
  return (
    <details className="detail-disclosure" open={initialOpen} ref={disclosureRef}>
      <summary>
        <span className="detail-summary-text">
          <span className="detail-summary-label">{label}</span>
          <small className="detail-summary-hint">{hint}</small>
        </span>
        <ChevronDown aria-hidden="true" size={17} />
      </summary>
      <div className="detail-disclosure-body">{children}</div>
    </details>
  );
}

function ActionLink({ href, children, primary = false }: {
  href: string;
  children: React.ReactNode;
  primary?: boolean;
}) {
  return <a className={primary ? "button primary" : "text-button"} href={href}
    target={safeUrl(href) ? "_blank" : undefined} rel="noreferrer">{children}</a>;
}
export function Detail({
  e,
  today,
  now = Date.now(),
  occurrence,
  entry,
  setGoing,
  onStage,
  onNote,
  knownOutreach,
  onOutreach,
  onMilestone,
  sharedMilestones,
  localMilestones,
  onRemoveMilestone,
  sharedVendorPricing,
  localVendorPricing,
  onVendorPricing,
  onRemoveVendorPricing,
  homeBase,
  budgetDefaults,
  localBudget,
  onTripBudget,
  saved,
  score,
  setOverride,
  openClash,
  conflicts = [],
  toast,
}: {
  e: Event;
  today: string;
  now?: number;
  occurrence?: string;
  entry: DisplayEntry;
  setGoing: SetGoing;
  onStage: (s: Stage) => void;
  onNote: (s: string) => void;
  knownOutreach?: Outreach | null;
  onOutreach: (patch: OutreachPatch) => void;
  onMilestone: (milestone: VendorMilestone) => void;
  sharedMilestones?: readonly VendorMilestone[];
  localMilestones?: readonly VendorMilestone[];
  onRemoveMilestone: (id: string) => void;
  sharedVendorPricing?: VendorPricingPatch;
  localVendorPricing?: VendorPricingPatch;
  onVendorPricing?: (patch: VendorPricingPatch) => void;
  onRemoveVendorPricing?: (field: keyof VendorPricingPatch, id: string) => void;
  homeBase?: string;
  budgetDefaults?: BudgetDefaults;
  localBudget?: Budget;
  onTripBudget?: (value?: Budget) => void;
  saved: boolean;
  score: ScoreResult;
  setOverride: (value: number | null) => void;
  openClash: (id: string) => void;
  conflicts?: ReturnType<typeof goingConflicts>;
  toast: React.ReactNode;
}) {
  const title = useRef<HTMLHeadingElement>(null);
  React.useLayoutEffect(() => title.current?.focus({ preventScroll: true }), [e.id]);
  const [draft, setDraft] = useState(entry.note);
  const draftRef = useRef(draft);
  const committed = useRef(entry.note);
  const onNoteRef = useRef(onNote);
  onNoteRef.current = onNote;
  const flush = useCallback(() => {
    if (draftRef.current !== committed.current) {
      committed.current = draftRef.current;
      onNoteRef.current(draftRef.current);
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(flush, 400);
    return () => clearTimeout(timer);
  }, [draft, flush]);
  useEffect(() => {
    const flushBeforeLeaving = () => flushSync(flush);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushBeforeLeaving();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flushBeforeLeaving);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flushBeforeLeaving);
      flush();
    };
  }, [flush]);
  const row = (label: string, v: React.ReactNode) =>
    v !== null && v !== undefined && v !== "" ? (
      <div className="detail-row">
        <dt>{label}</dt>
        <dd>{v}</dd>
      </div>
    ) : null;
  const link = (url: string | null, label: string) =>
    safeUrl(url) ? (
      <a href={url!} target="_blank" rel="noopener noreferrer">
        {label}
        <ArrowUpRight size={14} />
      </a>
    ) : null;
  const desktop = useMediaQuery("(min-width: 900px)");
  const [loggingQuote, setLoggingQuote] = useState(false);
  const [showAllDates, setShowAllDates] = useState(false);
  const priceFact = useRef<HTMLDivElement>(null);
  const outreachPanel = useRef<HTMLDetailsElement>(null);
  const moneyPanel = useRef<HTMLDetailsElement>(null);
  const outreachEditor = useRef<HTMLDetailsElement>(null);
  const planningPanel = useRef<HTMLDetailsElement>(null);
  const schedulePanel = useRef<HTMLDetailsElement>(null);
  function revealPanel(panel: HTMLDetailsElement | null) {
    if (!panel) return;
    panel.open = true;
    const summary = panel.querySelector("summary");
    summary?.focus({ preventScroll: true });
    summary?.scrollIntoView({ block: "start" });
  }
  function revealOutreach(edit?: "contact" | "exchange") {
    revealPanel(outreachPanel.current);
    if (!edit || !outreachEditor.current) return;
    outreachEditor.current.open = true;
    const field = outreachEditor.current.querySelector<HTMLElement>(edit === "contact" ? "input" : "select");
    field?.focus({ preventScroll: true });
    field?.scrollIntoView({ block: "nearest" });
  }

  const outreach = e.outreach;
  const outreachDay = saigonDay(now);
  const routes = vendorRoutes(e, knownOutreach);
  const timing = vendorTiming(e, now);
  const price = applicableVendorPrice(e, now);
  const priceOption = price && price.basis !== "listed" ? price.option : undefined;
  const priceUnit = priceOption?.includes.match(/\b(?:both days|per (?:day|table|booth)|for all \d+ days)\b/i)?.[0];
  const action = nextVendorAction(e, entry.stage, outreachDay, timing, routes, !!price);
  const canApply = isApplyPurpose(action.purpose);
  const application = !canApply && routes.application && vendorApplyAction(e, now, routes.application, timing);
  const contactAction = routes.contact && routeAction(routes.contact);
  const priceAmount = price && formatVendorAmount(price.amount, price.currency);
  const date = occurrence || displayDateLabel(e, today);
  const fit = meaningful(e.fit) || meaningful(e.expected_size) ||
    (meaningful(e.size_tier) && `Show size ${e.size_tier}${e.size_tier_estimated ? " (estimated)" : ""}`);
  const access = meaningful(e.vendor_booths) || (routes.application ? "Vendor route published" : "Vendor access not published");
  const normalize = (text?: string | null) => text?.trim().toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const terms = meaningful(e.booth_detail) && e.booth_detail &&
    ![e.vendor_booths, e.vendor_cost, price && price.basis !== "listed" ? price.option.notes : null]
      .some((value) => normalize(value)?.includes(normalize(e.booth_detail?.replace(/ only\.?$/i, ""))!)) &&
    !/^(?:vendor booths yes|vendor tables yes|exhibitor applications open)[;,. ]+(?:20\d\d )?rates not published\b|^(?:ask .+|no public vendor program|not announced)\.$/i.test(e.booth_detail)
    ? e.booth_detail : null;
  const moneyHasPricesOrDocs = Boolean(price || e.vendor_options?.length || e.vendor_documents?.length ||
    outreach?.published_booth_price || legacyVendorPrice(e));
  const hasMoney = moneyHasPricesOrDocs || Boolean(e.vendor_cost || terms || outreach?.price_source_url);
  const budget = localBudget ?? e.trip_budget;
  const budgetResult = calculateTripBudget(e, now, today, homeBase, occurrence, budget, budgetDefaults);
  const budgetHasCosts = Boolean(budgetResult.tableFee || budgetResult.extraCosts.some(({ cost }) => cost) ||
    budget?.custom?.length);
  const hasBudget = budgetHasCosts || Boolean(budget && Object.keys(budget).length);
  const budgetHint = budgetResult.total ? `Trip total · ${formatVendorAmount(budgetResult.total.vnd, "VND")}`
    : budgetResult.subtotal ? `Known costs · ${formatVendorAmount(budgetResult.subtotal.vnd, "VND")}` : "Trip costs and walk-away fee";
  const hasOutreach = Boolean(outreach && (outreach.status !== "not_contacted" || outreach.contacted_at ||
    outreach.response_at || outreach.acknowledgement_at || outreach.quoted_price || outreach.notes));
  const showType = meaningful(e.event_type);
  const area = meaningful(e.region_group);
  const hasSchedule = Boolean(ranges(e).length || e.estimated_month || e.date_note || e.venue || e.city || e.country ||
    showType || area || e.priority_market || e.vendor_milestones?.length || timing.referenceNotice);
  const sources = [...new Set([e.website, e.tickets ?? null, e.instagram, ...e.source_urls])]
    .filter((url): url is string => !!url && safeUrl(url));
  const about: [string, string | number | null | undefined][] = [
    ["Organizer", e.organizer],
    ["Audience", e.audience],
    ["Expected size", e.expected_size === fit ? null : e.expected_size],
    ["Size notes", e.size_note],
    ["Visitors", e.visitors?.toLocaleString()],
    ["Vendors", e.vendor_count?.toLocaleString()],
    ["Previous editions", e.previous_editions],
    ["Edition count", e.previous_editions_count],
    ["First year", e.first_year],
  ];
  const aboutRows = about.filter(([, value]) => meaningful(value));
  const publishedDates = [...(e.occurrences ?? [])].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const nextDates = publishedDates.filter((date) => date.end_date >= today).slice(0, 3);
  const visibleDates = showAllDates ? publishedDates : nextDates;
  const money = <VendorMoney event={e} now={now} shared={sharedVendorPricing} local={localVendorPricing}
    onSave={onVendorPricing} onRemove={onRemoveVendorPricing} terms={terms} />;
  const trip = <TripBudget event={e} now={now} today={today} occurrence={occurrence} homeBase={homeBase}
    local={localBudget} defaults={budgetDefaults} onSave={onTripBudget} />;
  const milestones = <BookingMilestones event={e} sharedMilestones={sharedMilestones} localMilestones={localMilestones}
    onSave={onMilestone} onRemove={onRemoveMilestone} featuredId={timing.milestone?.id} hideEmptyNotice />;

  return (
    <article className="event-layout" data-game={primaryGameKey(e)} data-event-id={e.id}>
      <header className="event-facts">
        <div className="event-identity">
          <h1 ref={title} tabIndex={-1}>{e.name}</h1>
          <div className="detail-badges">
            <Status e={e} />
            <FindBadges e={e} />
          </div>
          <p className="detail-date"><CalendarDays size={16} aria-hidden="true" />{date}</p>
          <p><Place e={e} /></p>
          <GoingButton e={e} going={entry.going} setGoing={setGoing} />
        </div>
        <div className="event-artwork"><Logo e={e} size="detail" /></div>
      </header>
      <section className="detail-body event-decision decision-card" aria-labelledby="decide-title">
        <h2 id="decide-title" className="sr-only">Decide</h2>
        <div className="decision-score">
          <PriorityChip result={score} />
          <div>
            <strong>{score.confidence} confidence</strong>
            {score.overridden && <small>Manual score · calculated {score.computedScore}</small>}
          </div>
        </div>
        <p className="decision-reason">{decisionReason(e, score)}</p>
        <div className="decision-stage">
          <label htmlFor="detail-stage">Pipeline stage</label>
          <StagePicker name={e.name} id="detail-stage" entry={entry} onChange={onStage} />
        </div>
        {conflicts.length > 0 && (
          <div className="decision-conflicts">
            <strong>Overlaps with events marked Going</strong>
            <ul>{conflicts.map((other) => <li key={`${other.id}:${other.date}`}>
              <a href={eventPath(other.id)} onClick={(ev) => {
                if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
                ev.preventDefault();
                openClash(other.id);
              }}>{other.name}</a> · {other.date}
            </li>)}</ul>
          </div>
        )}
        <section className="next-step" aria-labelledby="next-step-title">
          <h2 id="next-step-title">Next step</h2>
          <p>{action.sentence}</p>
          {!routes.contact && !routes.application && !action.panel && <small>No contact route found</small>}
          <div className="next-step-actions">
            {action.label && (action.href ? canApply
              ? <ApplyLink action={{ href: action.href, label: action.label }} />
              : <ActionLink href={action.href} primary>{action.label}</ActionLink>
              : <button className="button primary" onClick={() => {
                if (action.panel === "planning") revealPanel(planningPanel.current);
                else if (action.panel === "schedule") revealPanel(schedulePanel.current ?? planningPanel.current);
                else if (action.panel === "money") revealPanel(moneyPanel.current);
                else if (action.panel === "outreach") revealOutreach();
                else revealOutreach(action.panel === "outreach-edit" ? "exchange" : "contact");
              }}>{action.label}</button>)}
            {application && <ApplyLink action={application} />}
          </div>
        </section>
        <dl className="decision-facts">
          <div><dt>Vendor access</dt><dd>{access}</dd></div>
          <div><dt>{meaningful(e.fit) ? "Vendor fit" : "Event size"}</dt><dd>{fit || "Vendor fit and size not documented"}</dd></div>
          <div className="decision-price" tabIndex={-1} ref={priceFact}>
            <dt>Booth price</dt>
            {price ? (
              <dd>
                {price.basis === "listed" ? <>Listed · {priceAmount}{price.conditions && ` ${price.conditions}`}</> : <>
                  <strong>{formatVendorAmount(price.amount, price.currency)}</strong>
                  {price.option.amount_incl_vat !== undefined && " incl. VAT"} · {price.option.name}
                  {price.option.size && !price.option.name.includes(price.option.size) && ` · ${price.option.size}`}
                  {priceUnit && !price.option.name.toLowerCase().includes(priceUnit.toLowerCase()) && ` · ${priceUnit}`}
                  {price.basis === "quote" ? " · This-edition quote" : " · Published"}
                  {price.option.notes && ` · ${price.option.notes}`}
                  {price.option.valid_until && <> · Rate until <Cutoff until={price.option.valid_until} /></>}
                </>}
              </dd>
            ) : (
              <dd>
                <strong>Current booth price unknown</strong>
                <div className="decision-links">
                  {contactAction && action.panel !== "outreach-edit" && action.href !== contactAction.href &&
                    <ActionLink href={contactAction.href}>{contactAction.label}</ActionLink>}
                  {onVendorPricing && <button type="button" className="text-button" aria-haspopup="dialog"
                    onClick={() => setLoggingQuote(true)}>Log a quote</button>}
                </div>
              </dd>
            )}
          </div>
          <div className={timing.milestone ? "decision-timing-milestone" : undefined}>
            <dt>{timing.label}</dt>
            <dd>
              {timing.milestone ? <>
                <strong>{timing.milestone.label}{timing.passed && " · Passed"}</strong>
                {" "}<MilestoneTimes milestone={timing.milestone} />
                {timing.countdown && <span className="decision-countdown">{timing.countdown}</span>}
                {timing.notes && <small>{timing.notes}</small>}
              </> : timing.notice || "No vendor deadline published"}
            </dd>
          </div>
          <div className="decision-origin"><dt>Travel origin</dt><dd>{homeBaseLabel(resolveHomeBase(homeBase))}</dd></div>
        </dl>
      </section>
      <div className="detail-body event-information">
        <DetailDisclosure label="Outreach" hint={outreachStatusLabels[outreach?.status ?? "not_contacted"]}
          defaultOpen={hasOutreach || (desktop && publishedDates.length === 0)} disclosureRef={outreachPanel}>
          <OutreachSection today={outreachDay} outreach={outreach ?? undefined} knownOutreach={knownOutreach}
            routes={routes} editor={outreachEditor} eventContacts={[e.contact, e.vendor_application]}
            onSave={onOutreach} saved={saved} />
        </DetailDisclosure>
        {hasMoney && <DetailDisclosure label="Money" hint={priceAmount || "Rates and booth documents"}
          disclosureRef={moneyPanel} defaultOpen={desktop || moneyHasPricesOrDocs}>{money}</DetailDisclosure>}
        {hasBudget && <DetailDisclosure label="Budget / break-even" hint={budgetHint} defaultOpen={desktop || budgetHasCosts}>{trip}</DetailDisclosure>}
        {hasSchedule && (
          <DetailDisclosure label="When and where" hint={date} disclosureRef={schedulePanel}
            defaultOpen={desktop || Boolean(e.vendor_milestones?.length || publishedDates.length)}>
            <dl>
              {row("Venue", e.venue)}
              {row("Show type", showType)}
              {row("Area", area && (areaLabels[area] ?? area))}
              {row("Key market", e.priority_market ? "Yes" : "No")}
              {row("Date note", e.date_note)}
              {row("Vendor notice", timing.referenceNotice)}
            </dl>
            {publishedDates.length > 0 && (
              <div className="detail-occurrences">
                <div className="published-dates-heading">
                  <h3>Published dates</h3>
                  {publishedDates.length > nextDates.length && (
                    <button className="text-button" aria-expanded={showAllDates} aria-controls="published-event-dates"
                      onClick={() => setShowAllDates(!showAllDates)}>
                      {showAllDates ? "Show fewer dates" : `Show all ${publishedDates.length}`}
                    </button>
                  )}
                </div>
                <div className="occurrences" id="published-event-dates">
                  {visibleDates.length ? visibleDates.map((r) => (
                    <span key={r.start_date}>{prettyDate(r.start_date)}{r.end_date !== r.start_date && ` – ${prettyDate(r.end_date)}`}</span>
                  )) : <p>No upcoming dates.</p>}
                </div>
              </div>
            )}
            {hasConfirmedDates(e) && (
              <button className="button" onClick={() => download(ics([e]), e.id + ".ics", "text/calendar;charset=utf-8")}>
                <Download size={16} /> Add {e.occurrences ? "all occurrences" : "event"} to calendar
              </button>
            )}
            {milestones}
          </DetailDisclosure>
        )}
        <DetailDisclosure label="Your planning" hint={entry.stage} disclosureRef={planningPanel} defaultOpen={desktop || !!entry.note.trim()}>
          <div className="planning">
          <label htmlFor="event-note">Your notes</label>
          <textarea
            id="event-note"
            value={draft}
            placeholder={
              entry.stage === "Too expensive"
                ? "Booth price quoted…"
                : "Add event notes…"
            }
            onChange={(ev) => {
              draftRef.current = ev.target.value;
              setDraft(ev.target.value);
            }}
            onBlur={flush}
          />
          <small
            className="save-status"
            data-state={
              draft !== entry.note ? "saving" : saved ? "saved" : "unsaved"
            }
          >
            {draft !== entry.note ? (
              <LoaderCircle size={14} aria-hidden="true" />
            ) : saved ? (
              <CheckCircle2 size={14} aria-hidden="true" />
            ) : (
              <AlertTriangle size={14} aria-hidden="true" />
            )}
            <span>
              {draft !== entry.note
                ? "Saving…"
                : saved
                  ? "Saved on this device"
                  : "Not saved to this device — export a backup"}
              {entry.noteUpdatedAt &&
                ` · Last edited ${new Date(entry.noteUpdatedAt).toLocaleString()}`}
            </span>
          </small>
          <span className="sr-only" role="status">
            {saved && draft === entry.note
              ? "Notes saved on this device"
              : ""}
          </span>
          </div>
          {!hasMoney && onVendorPricing && <DetailDisclosure label="Add booth options or documents" hint="Booth rates and documents">{money}</DetailDisclosure>}
          {!hasBudget && onTripBudget && <DetailDisclosure label="Set up trip budget" hint={budgetHint}>{trip}</DetailDisclosure>}
          {!hasSchedule && milestones}
        </DetailDisclosure>
        {(e.description || e.games.length > 0 || aboutRows.length > 0) && (
          <DetailDisclosure label="About" hint={meaningful(e.organizer) || "Show background"}>
            {e.description && <p className="description">{e.description}</p>}
            {e.games.length > 0 && <div className="game-pills">{e.games.map((g) => (
              <span key={g} className="game-tag" data-game={gameKeyOf(g)}>{g}</span>
            ))}</div>}
            {aboutRows.length > 0 && <dl>{aboutRows.map(([label, value]) => <React.Fragment key={label}>{row(label, value)}</React.Fragment>)}</dl>}
          </DetailDisclosure>
        )}
        {score.tier !== "cancelled" && (
          <DetailDisclosure label="Score breakdown" hint={`Calculated score · ${score.computedScore}`}>
            <PriorityDetail result={score} setOverride={setOverride} openClash={openClash} />
          </DetailDisclosure>
        )}
        {(sources.length > 0 || e.source || e.instagram_followers != null) && (
          <DetailDisclosure label="Sources" hint={routes.official ? "Official site and research" : "Research links"}>
            {sources.length > 0 && <div className="source-links">
              {sources.map((url, i) => <React.Fragment key={url}>{link(url, url === e.website ? "Official website"
                : url === e.tickets ? "Tickets" : url === e.instagram ? "Instagram" : `Source ${i + 1}`)}</React.Fragment>)}
            </div>}
            {e.instagram_followers != null && (
              <p className="detail-stat"><Instagram size={16} aria-hidden="true" /> Instagram followers: {e.instagram_followers.toLocaleString()}</p>
            )}
            {e.source && <FindDetails e={e} />}
          </DetailDisclosure>
        )}
      </div>
      {loggingQuote && onVendorPricing && <VendorEditor editing={{ type: "option" }}
        close={() => setLoggingQuote(false)} save={(patch) => {
          onVendorPricing(patch);
          setLoggingQuote(false);
          requestAnimationFrame(() => {
            if (document.activeElement === document.body) priceFact.current?.focus({ preventScroll: true });
          });
        }} />}
      {toast}
    </article>
  );
}
