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
  stashBeforeReplace,
  validateBackup,
  importEntries,
  unknownIds,
  type Entries,
} from "../storage";
import { download } from "../utils";
export function BackupControls({
  entries,
  ids,
  apply,
  priority,
  applyPriority,
}: {
  entries: Entries;
  ids: string[];
  priority: PriorityPreferences;
  applyPriority: (value: PriorityPreferences) => void;
  apply: (entries: Entries) => void;
}) {
  const [preview, setPreview] = useState<Backup | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const absent = preview
    ? unknownIds(preview.entries, ids, preview.priority?.overrides)
    : [];
  return (
    <div className="backup-controls">
      <div className="backup-intro">
        <span className="backup-title">
          <HardDrive size={16} aria-hidden="true" /> Backup &amp; restore
        </span>
        <span>
          Going choices, stages, notes and score settings are kept in this
          browser only. Export a backup before switching devices.
        </span>
      </div>
      <div className="backup-actions">
        <button
          className="button"
          onClick={() =>
            download(
              JSON.stringify(backup(entries, priority), null, 2),
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
          {preview.priority && (
            <p>
              Imported score weights will apply to all events.{" "}
              {mode === "merge"
                ? "Imported overrides take precedence for matching IDs."
                : "Imported overrides replace all saved overrides."}
            </p>
          )}
          <div className="import-actions">
            <button
              className="button primary"
              onClick={() => {
                try {
                  if (mode === "replace") stashBeforeReplace(entries, priority);
                  apply(importEntries(entries, preview.entries, mode));
                  applyPriority(
                    importPriority(priority, preview.priority, mode),
                  );
                  setStatus(
                    `Imported ${Object.keys(preview.entries).length} entries (${mode}).`,
                  );
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
