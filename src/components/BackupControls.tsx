import { useState } from "react";
import {
  CheckCircle2,
  Download,
  HardDrive,
  TriangleAlert,
  Upload,
} from "lucide-react";
import {
  backup,
  importPriority,
  type PriorityPreferences,
  type Backup,
  type ListPreferences,
  stashBeforeReplace,
  validateBackup,
  importEntries,
  importOutreach,
  importMilestoneEdits,
  importVendorPricing,
  importTripBudget,
  type BudgetSettings,
  unknownIds,
  type Entries,
  type OutreachPatches,
  type MilestoneEdits,
  type VendorPricingEdits,
} from "../storage";
import { download } from "../utils";
import { findHomeBase, homeBaseLabel, resolveHomeBase } from "../homeBase";
export function BackupControls({
  entries,
  outreach,
  milestones,
  vendorPricing,
  tripBudget,
  ids,
  apply,
  priority,
  applyPriority,
  listPreferences,
  applyListPreferences,
}: {
  entries: Entries;
  outreach: OutreachPatches;
  milestones: MilestoneEdits;
  vendorPricing: VendorPricingEdits;
  tripBudget: BudgetSettings;
  ids: string[];
  priority: PriorityPreferences;
  applyPriority: (value: PriorityPreferences) => void;
  listPreferences: ListPreferences;
  applyListPreferences: (value: ListPreferences, mode: "merge" | "replace") => void;
  apply: (entries: Entries, outreach: OutreachPatches, milestones: MilestoneEdits, vendorPricing: VendorPricingEdits, tripBudget: BudgetSettings) => void;
}) {
  const [preview, setPreview] = useState<Backup | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const absent = preview
    ? unknownIds(preview.entries, ids, preview.priority?.overrides, preview.outreach, preview.milestones, preview.vendorPricing, preview.tripBudget?.events)
    : [];
  const outreachCount = Object.keys(preview?.outreach ?? {}).length;
  const outreachSummary = `${outreachCount} outreach ${outreachCount === 1 ? "patch" : "patches"}`;
  const milestoneCount = Object.values(preview?.milestones ?? {}).reduce((count, records) => count + records.length, 0);
  const milestoneSummary = `${milestoneCount} booking milestone ${milestoneCount === 1 ? "edit" : "edits"}`;
  const pricingCount = Object.values(preview?.vendorPricing ?? {}).reduce(
    (count, patch) => count + (patch.vendor_options?.length ?? 0) + (patch.vendor_documents?.length ?? 0), 0);
  const pricingSummary = `${pricingCount} booth option and document ${pricingCount === 1 ? "edit" : "edits"}`;
  const budgetCount = Object.keys(preview?.tripBudget?.events ?? {}).length;
  const budgetSummary = `${budgetCount} trip budget ${budgetCount === 1 ? "edit" : "edits"}`;
  const currentHomeBase = resolveHomeBase(priority.homeBase);
  const importedHomeBaseId = preview?.priority?.homeBase;
  const importedHomeBase = findHomeBase(importedHomeBaseId);
  return (
    <div className="backup-controls">
      <div className="backup-intro">
        <span className="backup-title">
          <HardDrive size={16} aria-hidden="true" /> Backup &amp; restore
        </span>
        <span>
          Going choices, stages, notes, outreach edits, booking milestones, booth option and document edits, trip budgets and defaults, score settings, and list preferences are kept in this
          browser only. Export a backup before switching devices.
        </span>
      </div>
      <div className="backup-actions">
        <button
          className="button"
          onClick={() =>
            download(
              JSON.stringify(backup(entries, priority, outreach, milestones, vendorPricing, tripBudget, listPreferences), null, 2),
              "tcg-pipeline-backup.json",
              "application/json",
            )
          }
        >
          <Download size={16} aria-hidden="true" /> Export backup
        </button>
        <label className="button">
          <Upload size={16} aria-hidden="true" /> Import JSON
          <input
            type="file"
            accept="application/json,.json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setPreview(null);
              try {
                if (file.size > 5 * 1024 * 1024)
                  throw new Error("Backup is too large (maximum 5 MB).");
                setPreview(validateBackup(JSON.parse(await file.text())));
                setError("");
              } catch (err) {
                setError(
                  err instanceof Error ? err.message : "Could not read backup",
                );
              }
            }}
          />
        </label>
      </div>
      <p role="status" className="backup-status">
        {status && <CheckCircle2 size={16} aria-hidden="true" />}
        {status}
      </p>
      {error && (
        <p role="alert" className="backup-error">
          <TriangleAlert size={16} aria-hidden="true" />
          {error}
        </p>
      )}
      {preview && (
        <section className="import-preview" aria-label="Import preview">
          <strong className="preview-title">
            Preview: {Object.keys(preview.entries).length} entries
          </strong>
          {preview.outreach && (
            <p>{outreachSummary}</p>
          )}
          {preview.milestones && <p>{milestoneSummary}</p>}
          {preview.vendorPricing && <p>{pricingSummary}</p>}
          {preview.tripBudget && <p>{budgetSummary}{preview.tripBudget.defaults !== undefined && " · includes trip budget defaults"}</p>}
          <p>
            {absent.length} IDs absent from current data (kept):{" "}
            {absent.slice(0, 20).join(", ") || "none"}
            {absent.length > 20 && ` … and ${absent.length - 20} more`}
          </p>
          <label>
            Import mode{" "}
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as typeof mode)}
            >
              <option value="merge">
                Merge — keep the newest Going choice, stage and note for each ID
              </option>
              <option value="replace">
                Replace — discard all existing entries, including absent IDs
              </option>
            </select>
          </label>
          <p>
            {mode === "replace"
              ? "Only imported entries will remain. Your current entries will be backed up on this device first."
              : "Other saved entries will remain, including absent IDs."}
          </p>
          <p>
            {!preview.outreach
              ? "This backup leaves your outreach edits as they are."
              : mode === "merge"
                ? "Imported outreach edits take precedence for matching fields."
                : "Imported outreach edits replace your current device edits. Shared outreach data still applies."}
          </p>
          {preview.milestones && (
            <p>{mode === "merge"
              ? "Imported booking edits take precedence for matching milestones."
              : "Imported booking edits replace your current device edits. Shared milestones still apply."}</p>
          )}
          {preview.vendorPricing && (
            <p>{mode === "merge"
              ? "Imported booth options and documents take precedence for matching records."
              : "Imported booth options and documents replace your device edits. Shared rates and documents still apply."}</p>
          )}
          {preview.tripBudget && (
            <p>{mode === "merge"
              ? "Imported budgets take precedence for matching events."
              : "Imported budgets replace the trip budgets and defaults saved on this device."}</p>
          )}
          {preview.listPreferences && (
            <p>{mode === "merge"
              ? "Imported list preferences take precedence for matching settings."
              : "Imported list preferences replace your current settings. Missing settings return to their defaults."}</p>
          )}
          {preview.priority && (
            <p>
              Imported score weights will apply to all events.{" "}
              {mode === "merge"
                ? "Imported overrides take precedence for matching IDs."
                : "Imported overrides replace all saved overrides."}
            </p>
          )}
          {importedHomeBase && importedHomeBase.id !== currentHomeBase.id && (
            <p>Home base will change from {homeBaseLabel(currentHomeBase)} to {homeBaseLabel(importedHomeBase)}.</p>
          )}
          {importedHomeBaseId !== undefined && !importedHomeBase && (
            <p>The backup specifies an unknown home base. Your home base will stay set to {homeBaseLabel(currentHomeBase)}.</p>
          )}
          <div className="import-actions">
            <button
              className="button primary"
              onClick={() => {
                try {
                  if (mode === "replace")
                    stashBeforeReplace(entries, priority, outreach, milestones, vendorPricing, tripBudget, listPreferences);
                  apply(
                    importEntries(entries, preview.entries, mode),
                    importOutreach(outreach, preview.outreach, mode),
                    importMilestoneEdits(milestones, preview.milestones, mode),
                    importVendorPricing(vendorPricing, preview.vendorPricing, mode),
                    importTripBudget(tripBudget, preview.tripBudget, mode),
                  );
                  applyPriority(
                    importPriority(priority, preview.priority, mode),
                  );
                  if (preview.listPreferences) applyListPreferences(preview.listPreferences, mode);
                  const summary = [
                    `${Object.keys(preview.entries).length} entries`,
                    preview.outreach && outreachSummary,
                    preview.milestones && milestoneSummary,
                    preview.vendorPricing && pricingSummary,
                    preview.tripBudget && budgetSummary,
                    preview.listPreferences && "list preferences",
                  ].filter(Boolean).join(" · ");
                  setStatus(`Imported ${summary} (${mode}).`);
                  setError("");
                  setPreview(null);
                } catch {
                  setError(
                    "Could not preserve the current entries. Export a backup and free device storage before replacing.",
                  );
                }
              }}
            >
              Confirm import
            </button>
            <button className="button" onClick={() => setPreview(null)}>
              Cancel
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
