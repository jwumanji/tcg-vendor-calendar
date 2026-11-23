import { it, expect } from "vitest";
import sharp from "sharp";
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
it("records import conflicts and scraper warnings, fills a logo, and performs read-only dry runs", () => {
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
    put("data/events.json", JSON.stringify([{
      ...original, id, logo: null, logo_kind: null, outreach: { ...outreach, notes: "" },
    }]));
    put("data/meta.json", '{"updatedAt":"2020-01-01"}');
    put("export/events.json", JSON.stringify([imported]));
    const webp = readFileSync("public/logos/mtg.webp");
    const preview = readFileSync("public/logos/afa.webp");
    put("export/logos/change.webp", webp);
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
      if (process.env.ALL_FAIL) return new Response("",{status:403});
      if (new URL(url).hostname === "www.sgcardshow.com") return new Response("<h1>Welcome</h1>");
      if (new URL(url).hostname !== "www.suntecsingapore.com") return new Response("",{status:403});
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
    expect(report.warnings).toContainEqual({
      source: "sg-card-show", message: "Missing event name in public HTML",
    });
    expect(report.import).toMatchObject({
      new_count: 0, fields_filled: 2, conflict_count: 1, logos_added: 1, logos_rejected: 0,
      conflicts: [{ event_id: id, field: "name", curated: original.name, incoming: imported.name }],
    });
    const snapshot = read("data/events.json");
    expect(JSON.parse(snapshot).filter((e: Event) => !e.source)).toEqual([
      { ...imported, name: original.name, outreach },
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
    expect(run([], true).status).toBe(1);
    expect(run(args, true).status).toBe(0);
    expect(read("data/events.json")).toBe(snapshot);
    expect(readFileSync(join(dir, "public/logos/change.webp"))).toEqual(webp);
    put("export/events.json", "[]");
    expect(run(args).status).toBe(0);
    expect(JSON.parse(read("scanner/last-run.json")).import).toMatchObject({ new_count: 0, fields_filled: 0 });
    expect(read("data/events.json")).toBe(snapshot);
    put("export/events.json", JSON.stringify([{ ...imported, logo: "logos/unreferenced.svg" }]));
    expect(run(args).status).toBe(0);
    expect(JSON.parse(read("scanner/last-run.json")).import.logo_rejections[0].reason).toMatch(/expected logos/);
    put("export/events.json", JSON.stringify([imported]));
    put("export/logos/change.webp", "<svg/>");
    expect(run(args).status).toBe(0);
    expect(JSON.parse(read("scanner/last-run.json")).import.logo_rejections[0].reason).toBe("invalid WebP");
    const broken = Buffer.from(webp);
    broken.fill(0, 12);
    put("export/logos/change.webp", broken);
    expect(run(args).status).toBe(0);
    expect(JSON.parse(read("scanner/last-run.json")).import.logos_rejected).toBe(1);
    expect(readFileSync(join(dir, "public/logos/change.webp"))).toEqual(webp);
    put("export/events.json", '[{"id":""}]');
    expect(run(args).status).toBe(1);
    expect(read("data/events.json")).toBe(snapshot);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 20000);

it("rejects tiny and placeholder art and only installs valid logos when curated art is absent", async () => {
  const dir = mkdtempSync(join(tmpdir(), "grailfox-refresh-logos-"));
  try {
    for (const sub of ["data", "public/logos", "scanner", "export/logos"])
      mkdirSync(join(dir, sub), { recursive: true });
    const put = (path: string, value: unknown) => writeFileSync(join(dir, path), JSON.stringify(value));
    const logo = (path: string) => join(dir, "public/logos", path);
    const raw = JSON.parse(readFileSync("data/events.json", "utf8")) as Event[];
    const original = raw.find((e) => !e.source)!;
    const event = (id: string, path: string | null): Event => ({
      ...original, id, name: id, logo: path && "logos/" + path, logo_kind: path ? "logo" : null,
    });
    const protectedRows = [
      event("protected-same-path", "protected.webp"),
      event("protected-new-path", "protected.webp"),
      event("restore-file", "restore.webp"),
      event("restore-reference", "missing.webp"),
    ];
    put("data/events.json", protectedRows);
    put("data/meta.json", {});
    const curated = readFileSync("public/logos/mtg.webp");
    const larger = await sharp(curated).resize(512, 512, { fit: "fill" }).webp().toBuffer();
    const tiny = await sharp(larger).resize(32, 32).webp().toBuffer();
    const blank = await sharp({
      create: { width: 512, height: 512, channels: 3, background: "#caff47" },
    }).webp().toBuffer();
    writeFileSync(logo("protected.webp"), curated);
    const exports = [
      event("protected-same-path", "protected.webp"),
      event("protected-new-path", "unused.webp"),
      event("restore-file", "restore.webp"),
      event("restore-reference", "restored-reference.webp"),
      event("new-valid", "good.webp"),
      event("new-tiny", "small.webp"),
      event("new-placeholder", "generic-placeholder.webp"),
      event("new-blank", "flat.webp"),
    ];
    put("export/events.json", exports);
    for (const item of exports) {
      const bytes = item.id === "new-tiny" ? tiny : item.id === "new-blank" ? blank : larger;
      writeFileSync(join(dir, "export", item.logo!), bytes);
    }
    const stub = join(dir, "offline.mjs");
    writeFileSync(stub, 'globalThis.fetch = async () => new Response("", { status: 403 });');
    const result = spawnSync(process.execPath, ["--import", stub, entry, "--import-scanner", "export/events.json"],
      { cwd: dir, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("Scanner import: 4 added");
    expect(readFileSync(logo("protected.webp"))).toEqual(curated);
    for (const name of ["restore.webp", "restored-reference.webp", "good.webp"])
      expect(readFileSync(logo(name))).toEqual(larger);
    for (const name of ["unused.webp", "small.webp", "generic-placeholder.webp", "flat.webp"])
      expect(existsSync(logo(name))).toBe(false);
    const output = JSON.parse(readFileSync(join(dir, "data/events.json"), "utf8")) as Event[];
    expect(output.map(({ logo }) => logo)).toEqual([
      "logos/protected.webp", "logos/protected.webp", "logos/restore.webp",
      "logos/restored-reference.webp", "logos/good.webp", null, null, null,
    ]);
    expect(output.slice(-3).every(({ logo_kind }) => logo_kind === null)).toBe(true);
    const report = JSON.parse(readFileSync(join(dir, "scanner/last-run.json"), "utf8"));
    expect(report.import).toMatchObject({ new_count: 4, logos_added: 3, logos_rejected: 5 });
    expect(report.import.logo_rejections).toEqual([
      expect.objectContaining({ event_id: "protected-same-path", reason: "existing logo file kept" }),
      expect.objectContaining({ event_id: "protected-new-path", reason: expect.stringContaining("curated logo kept") }),
      expect.objectContaining({ event_id: "new-tiny", reason: expect.stringContaining("64px") }),
      expect.objectContaining({ event_id: "new-placeholder", reason: "placeholder filename" }),
      expect.objectContaining({ event_id: "new-blank", reason: "blank or single-colour image" }),
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
