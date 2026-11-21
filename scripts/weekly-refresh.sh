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
check_inputs() {
  local dirty
  dirty=$(git status --porcelain --untracked-files=all -- data public/logos)
  [[ -z "$dirty" ]] || fail "uncommitted changes in data/ or public/logos/: $dirty"
}
exec 9>"$(git rev-parse --git-path weekly-refresh.lock)"
flock -n 9 || fail "another weekly refresh is running"
check_checkout
check_inputs
# Hash the entire live input trees, including untracked and ignored files.
snapshot() {
  tar --sort=name --mtime=@0 -cf - data public/logos | sha256sum
}
baseline=$(snapshot)
unchanged() {
  [[ "$(snapshot)" == "$baseline" && -z "$(git status --porcelain -- data public/logos)" ]]
}
verify_inputs() {
  unchanged || fail "data/ or public/logos/ changed during weekly refresh; live edits preserved"
}
if "$push"; then
  git fetch origin refs/heads/main:refs/remotes/origin/main
  verify_inputs
  if ! git merge-base --is-ancestor origin/main HEAD; then
    git rebase --no-autostash origin/main
    check_checkout
    check_inputs
    baseline=$(snapshot)
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
scanner_export=$(realpath -- "$scanner_export")
start_revision=$(git rev-parse HEAD)
repo_dir=$PWD
scratch=$(mktemp -d)
work="$scratch/scan"
report=scanner/last-run.json
generated=(data public/logos "$report")

publishing=false
cleanup() {
  local status=$?
  if (( status != 0 )) && ! "$publishing" && ! unchanged; then
    echo "ERROR: data/ or public/logos/ changed during weekly refresh; live edits preserved" >&2
  fi
  if [[ -e "$work/.git" ]]; then git worktree remove --force "$work"; fi
  rm -rf -- "$scratch"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
git worktree add --quiet --detach "$work" "$start_revision"
if [[ -d node_modules ]]; then ln -s -- "$repo_dir/node_modules" "$work/node_modules"; fi
(
  cd -- "$work"
  node scanner/run.ts --import-scanner "$scanner_export"
  git add -A -- "${generated[@]}"
  npm test
  npm run build
  git diff --quiet -- "${generated[@]}" || fail "generated files changed after scanning"
)
check_checkout
verify_inputs
[[ "$(git rev-parse HEAD)" == "$start_revision" ]] || fail "branch changed during weekly refresh"
day=$(TZ=Asia/Ho_Chi_Minh date +%F)
revision=$start_revision
result='deployment skipped'
changed=$(git -C "$work" diff --cached --name-only -- data public/logos)
if "$push" && [[ -n "$changed" ]]; then
  # Commit only the tested index in the isolated checkout. Fast-forwarding the
  # live branch lets Git check for conflicting worktree edits before checkout.
  git -C "$work" commit -m "Weekly refresh: Scanner export + scraper finds ($day)"
  revision=$(git -C "$work" rev-parse HEAD)
  verify_inputs
  publishing=true
  git merge --ff-only --no-overwrite-ignore "$revision" || fail "could not fast-forward live checkout"
else
  # Apply the tested patch against its original context. A staged report can
  # have clean working-tree bytes, so check the index independently as well.
  paths=(data public/logos)
  if git diff --quiet HEAD -- "$report" && git diff --cached --quiet -- "$report"; then
    paths+=("$report")
  elif [[ -n "$changed" ]]; then
    fail "run report has local edits"
  fi
  if ! git -C "$work" diff --cached --quiet -- "${paths[@]}"; then
    git -C "$work" diff --cached --binary -- "${paths[@]}" | git apply
  fi
fi
if "$push"; then
  [[ "$(git rev-parse HEAD)" == "$revision" ]] || fail "live branch differs from tested revision"
  if [[ "$revision" != "$(git rev-parse origin/main)" ]]; then
    git push origin "$revision:refs/heads/main"
  fi
  [[ "$revision" == "$(git rev-parse origin/main)" ]] || fail "origin/main differs from tested revision"
  last_deployed=''
  if [[ -f .vercel-deployed-sha ]]; then read -r last_deployed < .vercel-deployed-sha; fi
  if "$deploy" && { "$force" || [[ "$last_deployed" != "$revision" ]]; }; then
    # Build exactly the published tree, even if the working directory is edited
    # during deployment or contains an uncommitted run report.
    checkout="$scratch/checkout"
    mkdir "$checkout"
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
