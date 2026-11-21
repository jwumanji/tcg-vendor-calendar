import { it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  openSync,
  closeSync,
  existsSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { localDay } from "./dates.ts";
import type { Event } from "../src/model.ts";
import { mergeOutreach } from "../src/data.ts";

const entry = fileURLToPath(new URL("./run.ts", import.meta.url));
it("imports raw Scanner records, refreshes logos, fails soft, and performs read-only dry runs", () => {
  const dir = mkdtempSync(join(tmpdir(), "grailfox-refresh-"));
  try {
    for (const sub of ["data", "public/logos", "scanner", "export/logos"])
      mkdirSync(join(dir, sub), { recursive: true });
    const put = (path: string, s: string | Buffer) => writeFileSync(join(dir, path), s);
    const read = (path: string) => readFileSync(join(dir, path), "utf8");
    const raw = JSON.parse(readFileSync("data/events.json", "utf8")) as Event[];
    const { outreach: _existingOutreach, ...original } = raw.find((e) => !e.source)!;
    const id = "scanned-record";
    const outreach = mergeOutreach(null, { status: "contacted", method: "email", notes: "Planner note" });
    const imported = {
      ...original,
      name: "Test Scanner import",
      id,
      logo: "logos/change.webp",
    };
    put("data/events.json", JSON.stringify([{ ...original, id, outreach: { ...outreach, notes: "" } }]));
    put("data/meta.json", '{"updatedAt":"2020-01-01"}');
    put("export/events.json", JSON.stringify([imported]));
    const webp = readFileSync("public/logos/mtg.webp");
    const preview = readFileSync("public/logos/afa.webp");
    put("export/logos/change.webp", webp);
    put("public/logos/change.webp", "old");
    put("export/logos/unreferenced.svg", "<svg/>");
    put("export/logos/unreferenced.webp", webp);
    // Exercise the real executable without depending on public hosts or the current season.
    const date = localDay(new Date());
    const markup = `<article class="eventlist-event--upcoming"><h1 class="eventlist-title"><a class="eventlist-title-link" href="/show">Test Card Show</a></h1><time class="event-date" datetime="${date}"></time></article>`;
    put("listing.html", markup);
    put(
      "network.mjs",
      `import { readFileSync, writeFileSync } from "node:fs";
    globalThis.fetch = async url => {
      if (new URL(url).hostname !== "www.suntecsingapore.com" || process.env.ALL_FAIL) return new Response("",{status:403});
      if (process.env.SAVE_NOTE && new URL(url).pathname === "/robots.txt") {
        const events = JSON.parse(readFileSync("data/events.json", "utf8"));
        events[0].outreach.notes = process.env.SAVE_NOTE;
        writeFileSync("data/events.json", JSON.stringify(events));
      }
      return new Response(new URL(url).pathname === "/robots.txt" ? "" : readFileSync("listing.html", "utf8"));
    };`,
    );
    const run = (args: string[], fail = false, note = "") => {
      const log = openSync(join(dir, "scanner.log"), "w");
      try {
        const result = spawnSync(process.execPath, ["--import", join(dir, "network.mjs"), entry, ...args], {
          cwd: dir, stdio: ["ignore", "ignore", log],
          env: { ...process.env, ALL_FAIL: fail ? "1" : "", SAVE_NOTE: note },
        });
        if (result.error) throw result.error;
        return { status: result.status, stderr: read("scanner.log") };
      } finally {
        closeSync(log);
      }
    };
    const args = ["--import-scanner", join(dir, "export/events.json")];
    const first = run(args, false, outreach.notes);
    expect(first.status, first.stderr).toBe(0);
    const report = JSON.parse(read("scanner/last-run.json"));
    expect(
      report.sources.filter((s: { status: string }) => s.status === "FAILED"),
    ).toHaveLength(10);
    expect(report.new_count).toBe(1);
    const snapshot = read("data/events.json");
    expect(JSON.parse(snapshot).filter((e: Event) => !e.source)).toEqual([
      { ...imported, outreach },
    ]);
    expect(JSON.parse(read("data/meta.json")).updatedAt).toBe(date);
    expect(readFileSync(join(dir, "public/logos/change.webp"))).toEqual(webp);
    for (const ext of ["svg", "webp"])
      expect(existsSync(join(dir, "public/logos/unreferenced." + ext))).toBe(false);
    const summary = read("scanner/last-run.json");
    put("export/logos/change.webp", preview);
    expect(run([...args, "--dry-run"]).status).toBe(0);
    expect(readFileSync(join(dir, "public/logos/change.webp"))).toEqual(webp);
    expect(read("scanner/last-run.json")).toBe(summary);
    put("listing.html", markup.replace("Test Card Show", "Test Card Show has been cancelled") +
      markup.replace("Test Card Show", "Unknown Card Show (Postponed)").replace('href="/show"', 'href="/unknown"'));
    const changed = run([]);
    expect(changed.status, changed.stderr).toBe(0);
    expect(changed.stderr).toContain("Unmatched notice from suntec: Unknown Card Show");
    const notices = JSON.parse(read("scanner/last-run.json"));
    expect(notices).toMatchObject({ new_count: 0, notices_applied: 1, notices_unmatched: 1 });
    expect(notices.sources.find((s: { source: string }) => s.source === "suntec")).toMatchObject({
      notices_applied: 1, notices_unmatched: 1, dropped_as_junk: 0, status: "OK",
    });
    expect(JSON.parse(read("data/events.json")).find((e: Event) => e.source)).toMatchObject({
      event_status: "cancelled", start_date: date, date_note: "Test Card Show has been cancelled",
    });
    put("listing.html", markup);
    expect(run([]).status).toBe(0);
    expect(read("data/events.json")).toBe(snapshot);
    expect(run(args, true).status).toBe(1);
    expect(read("data/events.json")).toBe(snapshot);
    expect(readFileSync(join(dir, "public/logos/change.webp"))).toEqual(webp);
    put("export/events.json", "[]");
    const empty = run(args);
    expect(empty.stderr).toContain("Empty Scanner export");
    expect(read("data/events.json")).toBe(snapshot);
    put("export/events.json", JSON.stringify([{ ...imported, logo: "logos/unreferenced.svg" }]));
    expect(run(args).stderr).toContain("Invalid Scanner logo");
    put("export/events.json", JSON.stringify([imported]));
    put("export/logos/change.webp", "<svg/>");
    expect(run(args).stderr).toContain("Invalid WebP");
    const broken = Buffer.from(webp);
    broken.fill(0, 12);
    put("export/logos/change.webp", broken);
    expect(run(args).status).toBe(1);
    expect(readFileSync(join(dir, "public/logos/change.webp"))).toEqual(webp);
    put("export/events.json", '[{"id":""}]');
    expect(run(args).status).toBe(1);
    expect(read("data/events.json")).toBe(snapshot);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 20000);
