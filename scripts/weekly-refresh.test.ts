import { afterEach, beforeEach, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dir: string, repo: string;
function run(command: string, ...args: string[]) {
  return spawnSync(command, args, {
    cwd: repo, encoding: "utf8",
    env: { ...process.env, PATH: join(dir, "bin") + ":" + process.env.PATH,
      SCANNER_EXPORT: join(dir, "export.json"), TEST_DIR: dir },
  });
}
function git(...args: string[]) {
  const r = run("git", ...args);
  expect(r.status, r.stderr).toBe(0);
  return r.stdout.trim();
}
const refresh = (...args: string[]) => run("bash", "scripts/weekly-refresh.sh", ...args);
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "weekly-test-"));
  repo = join(dir, "repo");
  for (const d of ["bin", "repo/scripts", "repo/data", "repo/public/logos", "repo/scanner"])
    mkdirSync(join(dir, d), { recursive: true });
  git("init", "-b", "main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.test");
  cpSync("scripts/weekly-refresh.sh", join(repo, "scripts/weekly-refresh.sh"));
  cpSync(".gitignore", join(repo, ".gitignore"));
  writeFileSync(join(repo, "data/events.json"), "original");
  writeFileSync(join(repo, "public/logos/example.webp"), "original");
  writeFileSync(join(repo, "scanner/last-run.json"), '{"new_count":0}');
  writeFileSync(join(dir, "export.json"), "[]");
  writeFileSync(join(dir, "bin/npm"), `#!/bin/sh
    if test "$1" = test && test -e "$TEST_DIR/edit-during-run"; then
      echo 'hand edit' > "$TEST_DIR/repo/data/events.json"
      echo 'hand logo' > "$TEST_DIR/repo/public/logos/hand.webp"
    fi
    test "$1" != test || test ! -e "$TEST_DIR/fail-test" || exit 1
    test "$2" != build || test ! -e "$TEST_DIR/fail-build" || exit 1
  `, { mode: 0o755 });
  writeFileSync(join(repo, "scanner/run.ts"), `
    import fs from "node:fs";
    if (["scan", "test", "build"].some(step => fs.existsSync(process.env.TEST_DIR + "/fail-" + step))) {
      fs.unlinkSync("public/logos/example.webp");
      fs.writeFileSync("public/logos/new.webp", "partial");
    }
    fs.writeFileSync("data/events.json", "generated");
    fs.writeFileSync("scanner/last-run.json", JSON.stringify({new_count:0, time: Date.now()}));
    if (fs.existsSync(process.env.TEST_DIR + "/fail-scan")) process.exit(1);
  `);
  writeFileSync(join(repo, "scripts/deploy.sh"), `#!/bin/sh
    test ! -e "$TEST_DIR/fail-deploy" || exit 5
    cp scanner/last-run.json "$TEST_DIR/deployed-report"
    cat data/events.json >> "$TEST_DIR/deploys"
  `, { mode: 0o755 });
  git("add", ".");
  git("commit", "-m", "fixture");
  git("init", "--bare", join(dir, "remote"));
  git("remote", "add", "origin", join(dir, "remote"));
  git("push", "-u", "origin", "main");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

it("rejects a feature branch and unrelated staged, unstaged or untracked changes before scanning", () => {
  git("checkout", "-b", "feature");
  expect(refresh().stderr).toContain("ERROR: weekly refresh requires branch main");
  git("checkout", "main");
  for (const path of ["scripts/untracked", "scripts/weekly-refresh.sh", "README.md"]) {
    writeFileSync(join(repo, path), "edit", { flag: "a" });
    if (path === "README.md") git("add", path);
    expect(refresh("--no-push").stderr).toContain("ERROR: uncommitted changes");
    git("reset", "--hard");
    git("clean", "-fd");
  }
  expect(readFileSync(join(repo, "data/events.json"), "utf8")).toBe("original");
});

it("resumes a rejected push and a failed deployment, deploying the pushed SHA once", () => {
  const hook = join(dir, "remote/hooks/pre-receive");
  writeFileSync(hook, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  expect(refresh().status).not.toBe(0);
  const revision = git("rev-parse", "HEAD");
  expect(revision).not.toBe(git("rev-parse", "origin/main"));
  expect(existsSync(join(dir, "deploys"))).toBe(false);
  expect(git("diff", "--name-only", "origin/main", "HEAD")).toBe("data/events.json\nscanner/last-run.json");
  rmSync(hook);
  writeFileSync(join(dir, "fail-deploy"), "");
  expect(refresh().status).not.toBe(0);
  expect(git("rev-parse", "origin/main")).toBe(revision);
  expect(existsSync(join(repo, ".vercel-deployed-sha"))).toBe(false);
  rmSync(join(dir, "fail-deploy"));
  for (let i = 0; i < 2; i++) {
    const result = refresh();
    expect(result.status, result.stderr).toBe(0);
    expect(git("rev-parse", "HEAD")).toBe(revision);
  }
  expect(readFileSync(join(repo, ".vercel-deployed-sha"), "utf8").trim()).toBe(revision);
  expect(readFileSync(join(dir, "deploys"), "utf8")).toBe("generated");
  expect(readFileSync(join(dir, "deployed-report"), "utf8")).toBe(git("show", "HEAD:scanner/last-run.json"));
});

it.each([
  ["data/events.json", false],
  ["public/logos/example.webp", true],
  ["data/untracked.json", false],
  ["public/logos/untracked.webp", false],
])("protects a pre-existing edit to %s before running the scanner", (path, staged) => {
  writeFileSync(join(repo, path), "planner edit");
  if (staged) git("add", path);
  const before = git("status", "--porcelain");
  const result = refresh("--no-push");
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("uncommitted changes in data/ or public/logos/");
  expect(git("status", "--porcelain")).toBe(before);
  expect(readFileSync(join(repo, path), "utf8")).toBe("planner edit");
  expect(readFileSync(join(repo, "scanner/last-run.json"), "utf8")).toBe('{"new_count":0}');
});

it.each(["scan", "test", "build"])("discards isolated scan output after a %s failure", (step) => {
  const report = '{"new_count":3}';
  writeFileSync(join(repo, "scanner/last-run.json"), report);
  writeFileSync(join(dir, "fail-" + step), "");
  const result = refresh("--no-push");
  expect(result.status).not.toBe(0);
  expect(git("status", "--porcelain")).toBe("M scanner/last-run.json");
  expect(readFileSync(join(repo, "data/events.json"), "utf8")).toBe("original");
  expect(readFileSync(join(repo, "public/logos/example.webp"), "utf8")).toBe("original");
  expect(existsSync(join(repo, "public/logos/new.webp"))).toBe(false);
  expect(readFileSync(join(repo, "scanner/last-run.json"), "utf8")).toBe(report);
});

it.each([false, true])("preserves concurrent planner edits with a failing build = %s", (failBuild) => {
  const head = git("rev-parse", "HEAD");
  writeFileSync(join(dir, "edit-during-run"), "");
  if (failBuild) writeFileSync(join(dir, "fail-build"), "");
  const result = refresh("--no-deploy");
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("changed during weekly refresh");
  expect(readFileSync(join(repo, "data/events.json"), "utf8").trim()).toBe("hand edit");
  expect(readFileSync(join(repo, "public/logos/hand.webp"), "utf8").trim()).toBe("hand logo");
  expect(readFileSync(join(repo, "scanner/last-run.json"), "utf8")).toBe('{"new_count":0}');
  expect(git("diff", "--cached", "--name-only")).toBe("");
  expect(git("rev-parse", "HEAD")).toBe(head);
  expect(git("rev-parse", "origin/main")).toBe(head);
});

it("applies tested output locally without staging it in no-push mode", () => {
  const head = git("rev-parse", "HEAD");
  const result = refresh("--no-push");
  expect(result.status, result.stderr).toBe(0);
  expect(readFileSync(join(repo, "data/events.json"), "utf8")).toBe("generated");
  expect(JSON.parse(readFileSync(join(repo, "scanner/last-run.json"), "utf8")).time).toBeGreaterThan(0);
  expect(git("diff", "--cached", "--name-only")).toBe("");
  expect(git("rev-parse", "HEAD")).toBe(head);
  expect(git("rev-parse", "origin/main")).toBe(head);
});

it.each(["staged", "late"])("preserves a %s report edit across fast-forward publication", (when) => {
  const head = git("rev-parse", "HEAD");
  const report = "scanner/last-run.json";
  if (when === "staged") {
    writeFileSync(join(repo, report), "staged report");
    git("add", report);
    writeFileSync(join(repo, report), git("show", "HEAD:" + report));
  } else {
    const realGit = run("sh", "-c", "command -v git").stdout.trim();
    writeFileSync(join(dir, "bin/git"), `#!/bin/sh
      if test "$1" = merge; then echo 'late report' > "$TEST_DIR/repo/scanner/last-run.json"; fi
      exec "${realGit}" "$@"
    `, { mode: 0o755 });
  }
  expect(refresh("--no-deploy").status).not.toBe(0);
  expect(git("rev-parse", "HEAD")).toBe(head);
  expect(git("rev-parse", "origin/main")).toBe(head);
  expect(git("show", ":" + report)).toBe(when === "staged" ? "staged report" : git("show", "HEAD:" + report));
  expect(readFileSync(join(repo, report), "utf8").trim()).toBe(when === "late" ? "late report" : git("show", "HEAD:" + report));
});
