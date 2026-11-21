import {
  readFile,
  writeFile,
  rename,
  open,
  mkdir,
  rm,
} from "node:fs/promises";
import sharp from "sharp";
import { constants } from "node:fs";
import { ScheduleConflict, scheduleField, scheduleNotice, type Notice } from "./listing.ts";
import type { Source } from "./types.ts";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { normalizeEvents, validDate } from "../src/data.ts";
import type { Event } from "../src/model.ts";
import { localDay, horizon } from "./dates.ts";
import { createClient } from "./http.ts";
import { normalize } from "./normalize.ts";
import { relevance } from "./relevance.ts";
import { merge } from "./merge.ts";
import { sources } from "./sources/index.ts";

const json = (v: unknown) => JSON.stringify(v, null, 2) + "\n";
async function write(path: string, content: string | Buffer, original?: string) {
  const tmp = path + "." + randomUUID() + ".tmp";
  try {
    await writeFile(tmp, content);
    if (original !== undefined && await readFile(path, "utf8") !== original)
      throw Error("Event data changed during refresh. Rerun the scanner to keep those edits.");
    await rename(tmp, path);
  } finally {
    await rm(tmp, { force: true });
  }
}
export function validate(value: unknown): asserts value is Event[] {
  const rows = normalizeEvents(value);
  for (const [i, row] of rows.entries()) {
    const raw = (value as Event[])[i];
    if (
      !row.name.trim() ||
      !["timeline", "watchlist", "recurring_sg"].includes(raw.section) ||
      !["estimated", "confirmed", "tba"].includes(raw.date_status) ||
      raw.event_status !== row.event_status ||
      (raw.vendor_milestones !== undefined &&
        (!Array.isArray(raw.vendor_milestones) ||
          raw.vendor_milestones.length !== (row.vendor_milestones?.length ?? 0))) ||
      (raw.original_start_date !== undefined && !validDate(raw.original_start_date)) ||
      (Array.isArray(raw.occurrences) && raw.occurrences.some((r) =>
        r?.original_start_date !== undefined && !validDate(r.original_start_date))) ||
      (raw.date_status === "confirmed" &&
        (!validDate(raw.start_date) ||
          !validDate(raw.end_date) ||
          raw.end_date < raw.start_date)) ||
      (raw.date_status === "estimated" && !row.estimated_month) ||
      (raw.date_status !== "confirmed" &&
        (raw.start_date != null || raw.end_date != null)) ||
      (raw.source &&
        (!row.source?.id ||
          (raw.source.original_dates !== undefined &&
            (!Array.isArray(raw.source.original_dates) || raw.source.original_dates.length !== row.source.original_dates?.length)) ||
          (["previous_dates", "aliases"] as const).some((key) => raw.source![key] !== undefined &&
            (!Array.isArray(raw.source![key]) || raw.source![key]!.length !== row.source![key]?.length)) ||
          !row.source.url ||
          !row.source.discovered_at ||
          !row.source.name ||
          row.source.confidence == null ||
          row.source.relevance == null ||
          (raw.verification !== "unverified" && raw.verification !== "verified") ||
          raw.is_new_find !== true))
    )
      throw Error(`Invalid event output: ${row.id}`);
  }
}
async function logoChanges(path: string, events: Event[]) {
  const from = dirname(resolve(path));
  const changed = [];
  for (const logo of new Set(events.map((e) => e.logo))) {
    if (!logo) continue;
    if (!/^logos\/[\w.-]+\.webp$/i.test(logo))
      throw Error(`Invalid Scanner logo: ${logo}; expected logos/<filename>.webp`);
    const file = await open(join(from, logo), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    let bytes: Buffer;
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > 8 * 1024 * 1024) throw Error(`Invalid logo file: ${logo}`);
      bytes = await file.readFile();
    } finally {
      await file.close();
    }
    if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP" ||
        bytes.readUInt32LE(4) !== bytes.length - 8) throw Error(`Invalid WebP: ${logo}`);
    // Decode every referenced raster before any writes. Keep valid originals
    // byte-identical so an unchanged Scanner export does not churn the logos.
    const raster = sharp(bytes, { animated: true, limitInputPixels: 16_000_000, failOn: "warning" });
    await raster.raw().toBuffer();
    const dest = join("public", logo);
    const prev = await readFile(dest).catch((e: NodeJS.ErrnoException) => {
      if (e.code !== "ENOENT") throw e;
      return null;
    });
    if (!prev?.equals(bytes)) changed.push({ dest, bytes });
  }
  return changed;
}
function reason(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error.cause instanceof Error ? `${error.message}: ${error.cause.message}` : error.message;
}

export async function scanSource(source: Source, get: (url: string) => Promise<string>, now: Date) {
  const today = localDay(now), until = horizon(today);
  const stats = {
    source: source.id, fetched: 0, relevant: 0, new: 0, already_known: 0,
    dropped_as_junk: 0, outside_window: 0, status: "OK", reason: "",
  };
  const warnings: string[] = [];
  const events: Event[] = [], notices: Notice[] = [];
  try {
    const raw = await source.run({ get, warn: (message) => warnings.push(message) });
    stats.fetched = raw.length;
    let invalid = 0;
    for (const find of raw) {
      try {
        const notice = scheduleNotice(find.name, find.date);
        if (notice) {
          const e = normalize({
            ...find,
            name: notice.name,
            date: notice.dates?.start ?? null,
            date_status: notice.dates ? "confirmed" : notice.estimated_month ? "estimated" : "tba",
            estimated_month: notice.estimated_month,
          }, source, now.toISOString());
          notices.push({
            ...e, event_status: notice.kind, date_note: notice.note,
            end_date: notice.dates?.end ?? null,
            originalStart: notice.originalStart,
            originalEnd: notice.originalEnd,
            unknownOriginal: notice.unknownOriginal,
          });
          continue;
        }
        if (relevance(find.name, find.evidence) < 0.5) {
          stats.dropped_as_junk++;
          continue;
        }
        const e = normalize({ ...find, date: scheduleField(find.date).date }, source, now.toISOString());
        const month = e.estimated_month;
        if ((e.end_date && e.end_date < today) || (e.start_date && e.start_date > until) ||
            (month && (month < today.slice(0, 7) || month > until.slice(0, 7)))) {
          stats.outside_window++;
          continue;
        }
        stats.relevant++;
        events.push(e);
      } catch (error) {
        if (!(error instanceof ScheduleConflict)) invalid++;
        warnings.push(reason(error));
      }
    }
    if (warnings.length) {
      stats.status = invalid > 0 && invalid === raw.length ? "FAILED" : "PARTIAL";
      stats.reason = warnings.join(" | ");
    }
  } catch (error) {
    stats.status = "FAILED";
    stats.reason = reason(error);
  }
  return { stats, events, notices };
}

async function main() {
  const { values } = parseArgs({
    options: {
      "dry-run": { type: "boolean" },
      "import-scanner": { type: "string" },
    },
  });
  const dry = values["dry-run"],
    path = values["import-scanner"];
  let imported: Event[] | undefined;
  if (path) {
    const input: unknown = JSON.parse(await readFile(path, "utf8"));
    validate(input);
    if (input.some((e) => e.source))
      throw Error("Scanner export contains scraper-owned events");
    imported = input;
  }
  async function readSnapshot() {
    const original = await readFile("data/events.json", "utf8");
    const events: unknown = JSON.parse(original);
    validate(events);
    if (imported?.length === 0 && events.some((e) => !e.source))
      throw Error("Empty Scanner export would replace a nonempty Scanner snapshot");
    return { original, events };
  }
  await readSnapshot();
  const logos = path && imported ? await logoChanges(path, imported) : [];
  const now = new Date(),
    today = localDay(now),
    until = horizon(today);
  const results = await Promise.all(sources.map((source) => {
    const get = createClient([source.url]);
    const signal = AbortSignal.timeout(120_000);
    return scanSource(source, (url) => get(url, signal), now);
  }));
  // Source requests can take minutes. Pick up planner edits saved while they were in flight.
  const { original, events: existing } = await readSnapshot();
  const allFailed = results.every((r) => r.stats.status === "FAILED");
  const merged = merge(
    existing,
    results.flatMap((r) => r.events),
    today,
    imported,
    sources.map((source) => source.id),
    results.flatMap((r) => r.notices),
  );
  validate(merged.events);
  const rows = results.map(({ stats }) => ({
    ...stats,
    new: merged.added.filter((e) => e.source?.id === stats.source).length,
    notices_applied: merged.applied.filter((notice) => notice.source!.id === stats.source).length,
    notices_unmatched: merged.unmatched.filter((notice) => notice.source!.id === stats.source).length,
    ambiguous_listings: merged.ambiguous.filter((listing) => listing.source!.id === stats.source).length,
    already_known: merged.known[stats.source] ?? 0,
  }));
  const added = merged.added.map((e) => ({
    name: e.name,
    date: e.start_date ?? e.estimated_month,
    city: e.city,
    source: e.source!.id,
  }));
  const summary = {
    scanned_at: now.toISOString(),
    today,
    through: until,
    sources: rows,
    new_count: added.length,
    notices_applied: merged.applied.length,
    notices_unmatched: merged.unmatched.length,
    ambiguous_listings: merged.ambiguous.length,
    removed: merged.removed,
    new_events: added,
  };
  console.table(rows);
  for (const notice of merged.unmatched)
    console.warn(`Unmatched notice from ${notice.source!.id}: ${notice.name} (${notice.date_note})`);
  for (const e of added)
    console.log(`+ ${e.name} | ${e.date ?? "TBA"} | ${e.city} | ${e.source}`);
  console.log(
    `${added.length} new, ${merged.removed} removed, ${merged.events.length} total. ${logos.length} changed logos.`,
  );
  if (allFailed) {
    if (!dry) await write("scanner/last-run.json", json(summary));
    throw Error("All sources failed; refresh aborted");
  }
  if (dry) return;
  // Compare records before formatting: an otherwise identical legacy export may omit the final newline.
  const changed = JSON.stringify(existing) !== JSON.stringify(merged.events);
  const meta = JSON.parse(await readFile("data/meta.json", "utf8"));
  if (logos.length) await mkdir("public/logos", { recursive: true });
  for (const logo of logos) await write(logo.dest, logo.bytes);
  if (changed) {
    await write("data/events.json", json(merged.events), original);
    await write("data/meta.json", json({ ...meta, updatedAt: today }));
  }
  await write("scanner/last-run.json", json(summary));
}
if (import.meta.main)
  main().catch((err) => {
    console.error("ERROR:", err.message);
    process.exitCode = 1;
  });
