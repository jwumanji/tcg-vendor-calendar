import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { mergeOutreach, normalizeEvents, normalizeOutreachPatch, recordOutreachExchange } from "../src/data.ts";
import type { Event, Outreach } from "../src/model.ts";

export function seedOutreach(events: Event[], research: unknown, log: unknown): Event[] {
  const ids = new Set(events.map((event) => event.id));
  const readRows = (input: unknown, source: string) => {
    if (!Array.isArray(input)) throw new Error(`Expected an array in ${source}.`);
    return input.map((row: unknown) => {
      if (!row || typeof row !== "object" || !("id" in row) || typeof row.id !== "string")
        throw new Error(`Missing event ID in ${source}.`);
      if (!ids.has(row.id)) throw new Error(`Unknown event ID ${row.id} in ${source}.`);
      return row as Record<string, unknown> & { id: string };
    });
  };

  const seeded = new Map<string, Outreach>();
  const existing = new Map(events.map((event) => [event.id, event.outreach]));
  for (const row of readRows(research, "outreach research")) {
    if (seeded.has(row.id)) throw new Error(`Duplicate research for ${row.id}.`);
    const previous = existing.get(row.id);
    const contacted = previous && previous.status !== "not_contacted";
    const patch = normalizeOutreachPatch({
      contact_type: row.contact_type,
      contact: contacted && previous.contact ? previous.contact : row.contact || null,
      published_booth_price: row.published_booth_price || previous?.published_booth_price || null,
      ...((row.price_source_url || previous?.price_source_url) && {
        price_source_url: row.price_source_url || previous?.price_source_url,
      }),
      ...(row.notes && { research_notes: row.notes }),
    }, true);
    seeded.set(row.id, mergeOutreach(previous, patch));
  }
  for (const row of readRows(log, "outreach log")) {
    const patch = normalizeOutreachPatch(row, true);
    if (!patch.status || patch.status === "not_contacted")
      throw new Error(`Expected an outreach result for ${row.id}.`);
    seeded.set(row.id, recordOutreachExchange(seeded.get(row.id) ?? existing.get(row.id), patch));
  }
  return events.map((event) => {
    const outreach = seeded.get(event.id);
    return outreach ? { ...event, outreach } : event;
  });
}

async function main() {
  const file = (name: string) => new URL("../data/" + name, import.meta.url);
  const eventsFile = file("events.json");
  const [original, researchJson, logJson] = await Promise.all([
    readFile(eventsFile, "utf8"),
    readFile(file("outreach-contacts.json"), "utf8"),
    readFile(file("outreach-log.json"), "utf8"),
  ]);
  const events = JSON.parse(original);
  normalizeEvents(events);
  const research = JSON.parse(researchJson).events;
  const log = JSON.parse(logJson);
  const seeded = seedOutreach(events, research, log);
  if (JSON.stringify(seeded) === JSON.stringify(events)) {
    console.log("Outreach data is already up to date.");
    return;
  }
  const temporary = file(`events.json.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, JSON.stringify(seeded, null, 2) + "\n");
    if (await readFile(eventsFile, "utf8") !== original)
      throw new Error("Event data changed during seeding. Rerun the seed script.");
    await rename(temporary, eventsFile);
  } finally {
    await rm(temporary, { force: true });
  }
  console.log(`Seeded ${research.length} researched events and ${log.length} outreach log entries.`);
}

if (import.meta.main)
  main().catch((error) => {
    console.error("ERROR:", error.message);
    process.exitCode = 1;
  });
