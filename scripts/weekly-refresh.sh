#!/usr/bin/env bash
set -Eeuo pipefail
trap 'echo "ERROR: weekly refresh failed at line $LINENO ($BASH_COMMAND)" >&2' ERR
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
push=true
deploy=true
force=false
for flag in "$@"; do
  case "$flag" in
    --no-deploy) deploy=false ;;
    --no-push) push=false ;;
    --force-deploy) force=true ;;
    *) echo "ERROR: unknown option $flag" >&2; exit 2 ;;
  esac
done

fail() { echo "ERROR: $*" >&2; exit 1; }
check_checkout() {
  [[ $(git branch --show-current) == main ]] || fail "weekly refresh requires branch main"
  local dirty
  dirty=$(git status --porcelain --no-renames --untracked-files=all -- . \
    ':(exclude)data/**' ':(exclude)public/logos/**' ':(exclude)scanner/last-run.json')
  [[ -z "$dirty" ]] || fail "uncommitted changes outside generated paths: $dirty"
}
exec 9>"$(git rev-parse --git-path weekly-refresh.lock)"
flock -n 9 || fail "another weekly refresh is running"
check_checkout
if "$push"; then
  git fetch origin refs/heads/main:refs/remotes/origin/main
  if ! git merge-base --is-ancestor origin/main HEAD; then
    git rebase --autostash origin/main
    check_checkout
  fi
fi

scanner_export=${SCANNER_EXPORT:-/workspace/tcg-calendar/events.json}
if [[ ! -f "$scanner_export" ]]; then
  echo "ERROR: missing Scanner export at $scanner_export" >&2
  exit 1
fi
node --input-type=module - "$scanner_export" <<'JS'
import { readFileSync } from "node:fs";
try {
  if (!Array.isArray(JSON.parse(readFileSync(process.argv[2], "utf8"))))
    throw Error("expected a JSON array");
} catch (e) {
  console.error("ERROR: invalid Scanner export:", e.message);
  process.exit(1);
}
JS
node scanner/run.ts --import-scanner "$scanner_export"
npm test
npm run build
check_checkout
day=$(TZ=Asia/Ho_Chi_Minh date +%F)
result='deployment skipped'
if "$push"; then
  generated=(data public/logos scanner/last-run.json)
  # last-run.json has a new timestamp even on an otherwise unchanged scan.
  changed=$(git status --porcelain -- data public/logos)
  if [[ -n "$changed" ]]; then
    git add -A -- "${generated[@]}"
    git commit --only -m "Weekly refresh: Scanner export + scraper finds ($day)" -- "${generated[@]}"
  fi
  revision=$(git rev-parse HEAD)
  if [[ "$revision" != "$(git rev-parse origin/main)" ]]; then
    git push origin "$revision:refs/heads/main"
  fi
  [[ "$revision" == "$(git rev-parse origin/main)" ]] || fail "origin/main differs from tested revision"
  last_deployed=''
  if [[ -f .vercel-deployed-sha ]]; then read -r last_deployed < .vercel-deployed-sha; fi
  if "$deploy" && { "$force" || [[ "$last_deployed" != "$revision" ]]; }; then
    # Build exactly the published tree, even if the working directory is edited
    # during deployment or contains an uncommitted run report.
    checkout=$(mktemp -d)
    trap 'rm -rf -- "$checkout"' EXIT
    git archive "$revision" | tar -x -C "$checkout"
    (
      cd -- "$checkout"
      export PATH="$HOME/.local/bin:$PATH"
      npm ci
      scripts/deploy.sh
    )
    printf '%s\n' "$revision" > .vercel-deployed-sha.tmp
    mv -- .vercel-deployed-sha.tmp .vercel-deployed-sha
    result="deployed to ${PLANNER_URL:-https://planner.grailfoxtcg.com}"
  fi
else
  echo "Local data refreshed; --no-push skips publication"
fi
count=$(node -p "require('./scanner/last-run.json').new_count")
echo "Weekly refresh finished on $day with $count new finds; $result."
