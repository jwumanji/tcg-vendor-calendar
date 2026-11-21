import { afterEach, beforeEach, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const script = resolve("scripts/check-deployment.sh");
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "planner-smoke-"));
  mkdirSync(join(dir, "dist/assets"), { recursive: true });
  writeFileSync(join(dir, "dist/assets/index-current.js"), "console.log(1)");
  writeFileSync(join(dir, "dist/assets/index-current.css"), "body { color: #444 }");
  writeFileSync(join(dir, "dist/index.html"), '<meta name="planner-build-id" content="new-release"><script src="/assets/index-current.js"></script><link href="/assets/index-current.css">');
  writeFileSync(join(dir, "sleep"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  writeFileSync(join(dir, "curl"), `#!/usr/bin/env bash
    while [[ $# -gt 1 ]]; do
      case "$1" in -o) body=$2; shift ;; -D) headers=$2; shift ;; esac
      shift
    done
    url=$1
    echo 'X-Robots-Tag: noindex' > "$headers"
    case "$url" in
      */assets/*.js) cp dist/assets/index-current.js "$body"; echo 'Content-Type: text/javascript; charset=utf-8' >> "$headers" ;;
      */assets/*.css) cp dist/assets/index-current.css "$body"; echo 'Content-Type: text/css' >> "$headers" ;;
      *) cp dist/index.html "$body" ;;
    esac
    case "$SCENARIO:$url" in
      protected*:https://immutable.vercel.app/) echo -n 401; exit 0 ;;
      protected-wrong-alias:https://alias/*|protected-wrong-custom:https://custom/*) sed -i 's/new-release/old-release/' "$body" ;;
      protected-unreachable:https://custom/*) echo -n 000; exit 6 ;;
      public-401:https://alias/*) echo -n 401; exit 0 ;;
      html-asset:*/assets/*.js) cp dist/index.html "$body"; echo 'Content-Type: text/html' > "$headers" ;;
      wrong-js:*/assets/*.js|wrong-css:*/assets/*.css) echo 'Content-Type: text/html' > "$headers" ;;
      stale-bytes:*/assets/*.css) echo 'stale' > "$body" ;;
      unreachable:https://custom/*) echo -n 000; exit 6 ;;
      refused:https://custom/*) echo -n 000; exit 7 ;;
      bad-cert:https://custom/*) echo -n 000; exit 60 ;;
      stale-immutable:https://immutable.vercel.app/*|stale-public-only:https://alias/*)
        sed -i 's/new-release/old-release/' "$body" ;;
      missing-js:https://alias/assets/index-current.js|missing-css:https://custom/assets/index-current.css)
        echo -n 404; exit 0 ;;
      stale-alias:https://alias/*|stale-custom:https://custom/*)
        sed -i 's/current/stale/g' "$body" ;;
      propagate:https://alias/)
        if [[ ! -f seen ]]; then touch seen; sed -i 's/current/stale/g' "$body"; fi ;;
      bad-fallback:*/some/deep/link) echo 'fallback' > "$body" ;;
      missing-header:*/some/deep/link) : > "$headers" ;;
    esac
    echo -n 200
  `, { mode: 0o755 });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

it.each([
  ["html-asset", 1], ["wrong-js", 1], ["wrong-css", 1], ["stale-bytes", 1], ["protected", 0],
  ["protected-wrong-alias", 1], ["protected-wrong-custom", 1], ["protected-unreachable", 1], ["public-401", 1],
  ["stale-immutable", 1], ["stale-public-only", 1], ["missing-js", 1], ["missing-css", 1],
  ["bad-cert", 1], ["refused", 0], ["propagate", 0], ["unreachable", 0], ["stale-alias", 1],
  ["stale-custom", 1], ["bad-fallback", 1], ["missing-header", 1],
])("checks the current build on the alias and answering custom domain: %s", (scenario, status) => {
  const result = spawnSync("bash", [script, "https://immutable.vercel.app", "https://alias", "https://custom"], {
    cwd: dir, encoding: "utf8",
    env: { ...process.env, PATH: dir + ":" + process.env.PATH, SCENARIO: scenario },
  });
  expect(result.status, result.stderr).toBe(status);
});
