#!/usr/bin/env bash
set -euo pipefail

prod=()
case "${1:-}" in
  '') [[ $# -eq 0 ]] || { echo 'Usage: scripts/deploy-grailfox.sh [--prod]' >&2; exit 2; } ;;
  --prod) [[ $# -eq 1 ]] || { echo 'Usage: scripts/deploy-grailfox.sh [--prod]' >&2; exit 2; }; prod=(--prod) ;;
  *) echo 'Usage: scripts/deploy-grailfox.sh [--prod]' >&2; exit 2 ;;
esac

export GRAILFOX_SITE="${GRAILFOX_SITE:-/workspace/grailfox-site}"
export VERCEL_SCOPE="${VERCEL_SCOPE:-justin-9436s-projects}"
export VERCEL_TEAM_ID="${VERCEL_TEAM_ID:-team_E7PuNgRyzGwto2cmIFZZcrUX}"
export VERCEL_PROJECT="${VERCEL_PROJECT:-grailfoxtcg}"
export VERCEL_PROJECT_ID="${VERCEL_PROJECT_ID:-prj_7k0k6RI7FbvlSAYGrNcLsM8vzroU}"
# The Vercel CLI requires VERCEL_ORG_ID whenever VERCEL_PROJECT_ID is set.
export VERCEL_ORG_ID="${VERCEL_ORG_ID:-$VERCEL_TEAM_ID}"
export PLANNER_PATH="${PLANNER_PATH:-vendor-planner}"
# Keep the replacement directory strictly inside static/ and URL-safe.
if [[ ! "$PLANNER_PATH" =~ ^[a-zA-Z0-9_-]+(/[a-zA-Z0-9_-]+)*$ ]]; then
  echo 'PLANNER_PATH must contain URL-safe path segments without surrounding slashes.' >&2
  exit 2
fi
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"
echo "Syncing live $VERCEL_PROJECT output..."
python3 scripts/grailfox_sync.py sync
synced_id="$(cat "$GRAILFOX_SITE/.vercel/synced-deployment-id")"
printf 'Current production deployment: %s\n' "$synced_id"
printf 'Rollback command: vercel rollback %s --scope %s\n' "$synced_id" "$VERCEL_SCOPE"
planner_dir="$GRAILFOX_SITE/.vercel/output/static/$PLANNER_PATH"
if [[ -e "$planner_dir" || -L "$planner_dir" ]]; then
  if [[ ! -d "$planner_dir" ]] || { [[ ! -f "$planner_dir/.holo-vault-planner" ]] && ! grep -q 'Holo Vault' "$planner_dir/manifest.webmanifest" 2>/dev/null; }; then
    echo "Refusing to replace existing non-planner output: $planner_dir" >&2
    exit 1
  fi
fi
npm test
VITE_BASE="/$PLANNER_PATH/" npm run build
planner_dir="$GRAILFOX_SITE/.vercel/output/static/$PLANNER_PATH"
rm -rf -- "$planner_dir"
mkdir -p -- "$planner_dir"
cp -a dist/. "$planner_dir/"
touch "$planner_dir/.holo-vault-planner"
python3 scripts/grailfox_sync.py patch
python3 scripts/grailfox_sync.py check-production
cd "$GRAILFOX_SITE"
deployment_url="$(vercel deploy --prebuilt --yes --scope "$VERCEL_SCOPE" ${prod[@]+"${prod[@]}"})"
# Depending on the CLI version/TTY, stdout is either the bare URL or a JSON
# object; pick out the deployment URL either way.
deployment_url="$(printf '%s' "$deployment_url" | python3 -c '
import json, re, sys
raw = sys.stdin.read()
try:
    d = json.loads(raw)
    url = d.get("url") or (d.get("deployment") or {}).get("url") or ""
except ValueError:
    url = ""
if not url:
    m = re.findall(r"https://[^\s\"]+\.vercel\.app", raw)
    url = m[-1] if m else raw.strip().splitlines()[-1] if raw.strip() else ""
if url and not url.startswith("http"):
    url = "https://" + url
print(url)
')"
if [[ ! "$deployment_url" =~ ^https://[^[:space:]]+$ ]]; then
  echo "Unexpected deployment URL: $deployment_url" >&2
  exit 1
fi
printf 'Deployment URL: %s\n' "$deployment_url"
headers="$(mktemp)"
trap 'rm -f -- "$headers"' EXIT
smoke_host="$deployment_url"
if [[ ${#prod[@]} -gt 0 ]]; then
  smoke_host='https://www.grailfoxtcg.com'
fi

check_response() {
  local path="$1" expected="$2" status
  if ! status="$(curl --silent --show-error --max-time 20 --retry 3 --retry-all-errors \
    --dump-header "$headers" --output /dev/null --write-out '%{http_code}' "$smoke_host$path")"; then
    echo "Smoke check failed: request to $smoke_host$path failed" >&2
    return 1
  fi
  if [[ ${#prod[@]} -eq 0 && ( "$status" == 401 || "$status" == 302 || "$status" == 403 ) ]]; then
    echo "Warning: preview deployment protection (HTTP $status) at $path; check skipped." >&2
    return 0
  fi
  if [[ "$status" != "$expected" ]]; then
    echo "Smoke check failed: $path returned HTTP $status (expected $expected)" >&2
    return 1
  fi
  if [[ "$path" != / ]]; then
    if ! grep -qi '^x-robots-tag:' "$headers"; then
      echo "Smoke check failed: $path missing X-Robots-Tag header" >&2
      return 1
    fi
    if [[ "$expected" == 308 ]] && ! tr -d '\r' < "$headers" | grep -Eqi "^location: /$PLANNER_PATH/[[:space:]]*$"; then
      echo "Smoke check failed: $path missing Location: /$PLANNER_PATH/" >&2
      return 1
    fi
  fi
}

smoke_check() {
  check_response "/$PLANNER_PATH/" 200 || return 1
  check_response "/$PLANNER_PATH" 308 || return 1
  if [[ ${#prod[@]} -gt 0 ]]; then
    check_response / 200 || return 1
  fi
}

attempt=1
max_attempts=1
if [[ ${#prod[@]} -gt 0 ]]; then max_attempts=4; fi
until smoke_check; do
  if [[ "$attempt" -ge "$max_attempts" ]]; then exit 1; fi
  echo 'Waiting for production alias propagation; retrying smoke checks...' >&2
  sleep 5
  attempt=$((attempt + 1))
done
echo "Smoke checks passed for $smoke_host (protected preview checks may be skipped)."
