import {
  readFile,
  writeFile,
  rename,
  readdir,
  mkdir,
  rm,
} from "node:fs/promises";
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
async function write(path: string, content: string | Buffer) {
  const tmp = path + "." + randomUUID() + ".tmp";
  try {
    await writeFile(tmp, content);
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
      (raw.date_status === "confirmed" &&
        (!validDate(raw.start_date) ||
          !validDate(raw.end_date) ||
          raw.end_date < raw.start_date)) ||
      (raw.date_status === "estimated" && !row.estimated_month) ||
      (raw.date_status !== "confirmed" &&
        (raw.start_date != null || raw.end_date != null)) ||
      (raw.source &&
        (!row.source?.id ||
          !row.source.url ||
          !row.source.discovered_at ||
          !row.source.name ||
          row.source.confidence == null ||
          row.source.relevance == null ||
          raw.verification !== "unverified" ||
          raw.is_new_find !== true))
    )
      throw Error(`Invalid event output: ${row.id}`);
  }
}
async function logoChanges(path: string) {
  const from = join(dirname(resolve(path)), "logos");
  const changed = [];
  for (const entry of await readdir(from, { withFileTypes: true })) {
    if (
      !entry.isFile() ||
      !/^[\w.-]+\.(webp|png|jpe?g|gif|svg)$/i.test(entry.name)
    )
      continue;
    const bytes = await readFile(join(from, entry.name));
    const dest = join("public/logos", entry.name);
    const prev = await readFile(dest).catch((e: NodeJS.ErrnoException) => {
      if (e.code !== "ENOENT") throw e;
      return null;
    });
    if (!prev?.equals(bytes)) changed.push({ dest, bytes });
  }
  return changed;
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
  const original = await readFile("data/events.json", "utf8");
  const existing: unknown = JSON.parse(original);
  validate(existing);
  let imported: Event[] | undefined;
  if (path) {
    const input: unknown = JSON.parse(await readFile(path, "utf8"));
    validate(input);
    if (input.some((e) => e.source))
      throw Error("Scanner export contains scraper-owned events");
    imported = input;
  }
  const logos = path ? await logoChanges(path) : [];
  const now = new Date(),
    today = localDay(now),
    until = horizon(today);
  const get = createClient();
  const results = await Promise.all(
    sources.map(async (source) => {
      const stats = {
        source: source.id,
        fetched: 0,
        relevant: 0,
        new: 0,
        already_known: 0,
        dropped_as_junk: 0,
        outside_window: 0,
        status: "OK",
        reason: "",
      };
      const events: Event[] = [];
      try {
        const signal = AbortSignal.timeout(120_000);
        const raw = await source.run({ get: (url) => get(url, signal) });
        stats.fetched = raw.length;
        for (const find of raw) {
          if (relevance(find.name, find.evidence) < 0.5) {
            stats.dropped_as_junk++;
            continue;
          }
          const e = normalize(find, source, now.toISOString());
          const month = e.estimated_month;
          if (
            (e.end_date && e.end_date < today) ||
            (e.start_date && e.start_date > until) ||
            (month && (month < today.slice(0, 7) || month > until.slice(0, 7)))
          ) {
            stats.outside_window++;
            continue;
          }
          stats.relevant++;
          events.push(e);
        }
      } catch (err) {
        stats.status = "FAILED";
        stats.reason = err instanceof Error ? err.message : String(err);
        events.length = 0;
      }
      return { stats, events };
    }),
  );
  const allFailed = results.every((r) => r.stats.status === "FAILED");
  const merged = merge(
    existing,
    results.flatMap((r) => r.events),
    today,
    imported,
    sources.map((source) => source.id),
  );
  validate(merged.events);
  const rows = results.map(({ stats }) => ({
    ...stats,
    new: merged.added.filter((e) => e.source?.id === stats.source).length,
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
    removed: merged.removed,
    new_events: added,
  };
  console.table(rows);
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
    await write("data/meta.json", json({ ...meta, updatedAt: today }));
    await write("data/events.json", json(merged.events));
  }
  await write("scanner/last-run.json", json(summary));
}
if (import.meta.main)
  main().catch((err) => {
    console.error("ERROR:", err.message);
    process.exitCode = 1;
  });
