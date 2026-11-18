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

scanner_export=/workspace/tcg-calendar/events.json
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
changed=$(git status --porcelain -- data public/logos)
day=$(TZ=Asia/Ho_Chi_Minh date +%F)
if [[ -n "$changed" ]]; then
  if "$push"; then
    git add -- data public/logos scanner/last-run.json
    git commit --only -m "Weekly refresh: Scanner export + scraper finds ($day)" -- data public/logos scanner/last-run.json
    git pull --rebase
    git push origin main
  else
    echo "Local data refreshed; --no-push skips commit, pull and push"
  fi
else
  echo "No data changes, skipping commit"
fi
result='deployment skipped'
if "$deploy" && { [[ -n "$changed" ]] || "$force"; }; then
  export PATH="$HOME/.local/bin:$PATH"
  scripts/deploy-grailfox.sh --prod
  result="deployed to https://www.grailfoxtcg.com/${PLANNER_PATH:-vendor-planner}/"
fi
count=$(node -p "require('./scanner/last-run.json').new_count")
echo "Weekly refresh finished on $day with $count new finds; $result."
