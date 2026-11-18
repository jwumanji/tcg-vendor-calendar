import { it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { localDay } from "./dates.ts";
import type { Event } from "../src/model.ts";

const entry = fileURLToPath(new URL("./run.ts", import.meta.url));
it("imports raw Scanner records, refreshes logos, fails soft, and performs read-only dry runs", () => {
  const dir = mkdtempSync(join(tmpdir(), "grailfox-refresh-"));
  try {
    for (const sub of ["data", "public/logos", "scanner", "export/logos"])
      mkdirSync(join(dir, sub), { recursive: true });
    const put = (path: string, s: string) => writeFileSync(join(dir, path), s);
    const read = (path: string) => readFileSync(join(dir, path), "utf8");
    const original = JSON.parse(readFileSync("data/events.json", "utf8")).find(
      (e: Event) => !e.source,
    );
    const imported = {
      ...original,
      name: "Test Scanner import",
      id: "scanned-record",
    };
    put("data/events.json", JSON.stringify([original]));
    put("data/meta.json", '{"updatedAt":"2020-01-01"}');
    put("export/events.json", JSON.stringify([imported]));
    put("export/logos/same.webp", "same");
    put("public/logos/same.webp", "same");
    put("export/logos/change.webp", "changed");
    put("public/logos/change.webp", "old");
    put("export/logos/new.webp", "new");
    // Exercise the real executable without depending on public hosts or the current season.
    const date = localDay(new Date());
    const markup = `<article class="eventlist-event--upcoming"><h1 class="eventlist-title"><a class="eventlist-title-link" href="/show">Test Card Show</a></h1><time class="event-date" datetime="${date}"></time></article>`;
    put(
      "network.mjs",
      `globalThis.fetch = async url => {
      if (new URL(url).hostname !== "www.suntecsingapore.com" || process.env.ALL_FAIL) return new Response("",{status:403});
      return new Response(new URL(url).pathname === "/robots.txt" ? "" : ${JSON.stringify(markup)});
    };`,
    );
    const run = (args: string[], fail = false) =>
      spawnSync(
        process.execPath,
        ["--import", join(dir, "network.mjs"), entry, ...args],
        {
          cwd: dir,
          encoding: "utf8",
          env: { ...process.env, ALL_FAIL: fail ? "1" : "" },
        },
      );
    const args = ["--import-scanner", join(dir, "export/events.json")];
    const first = run(args);
    expect(first.status, first.stderr).toBe(0);
    const report = JSON.parse(read("scanner/last-run.json"));
    expect(
      report.sources.filter((s: { status: string }) => s.status === "FAILED"),
    ).toHaveLength(10);
    expect(report.new_count).toBe(1);
    const snapshot = read("data/events.json");
    expect(JSON.parse(snapshot).filter((e: Event) => !e.source)).toEqual([
      imported,
    ]);
    expect(JSON.parse(read("data/meta.json")).updatedAt).toBe(date);
    expect(read("public/logos/change.webp")).toBe("changed");
    expect(read("public/logos/new.webp")).toBe("new");
    const summary = read("scanner/last-run.json");
    put("export/logos/change.webp", "preview only");
    expect(run([...args, "--dry-run"]).status).toBe(0);
    expect(read("public/logos/change.webp")).toBe("changed");
    expect(read("scanner/last-run.json")).toBe(summary);
    expect(run([]).status).toBe(0);
    expect(read("data/events.json")).toBe(snapshot);
    expect(run(args, true).status).toBe(1);
    expect(read("data/events.json")).toBe(snapshot);
    expect(read("public/logos/change.webp")).toBe("changed");
    put("export/events.json", '[{"id":""}]');
    expect(run(args).status).toBe(1);
    expect(read("data/events.json")).toBe(snapshot);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 20000);
