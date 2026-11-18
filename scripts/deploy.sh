#!/usr/bin/env bash
# Build the planner and deploy dist/ to the dedicated Vercel project
# "vendor-planner" (served at https://planner.grailfoxtcg.com, root path).
# Usage: scripts/deploy.sh [--skip-tests]
set -Eeuo pipefail
trap 'echo "ERROR: deploy failed at line $LINENO ($BASH_COMMAND)" >&2' ERR
export PATH="$HOME/.local/bin:$PATH"

skip_tests=false
case "${1:-}" in
  '') ;;
  --skip-tests) skip_tests=true ;;
  *) echo 'Usage: scripts/deploy.sh [--skip-tests]' >&2; exit 2 ;;
esac

SCOPE="${VERCEL_SCOPE:-justin-9436s-projects}"
PROJECT="${VERCEL_PROJECT:-vendor-planner}"
SITE_URL="${PLANNER_URL:-https://planner.grailfoxtcg.com}"
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"

command -v vercel >/dev/null || { echo 'ERROR: vercel CLI not found' >&2; exit 1; }
[[ "$skip_tests" == true ]] || npm test
npm run build
[[ -f dist/index.html && -f dist/vercel.json ]] || { echo 'ERROR: dist is missing index.html or vercel.json' >&2; exit 1; }
grep -q 'noindex' dist/index.html || { echo 'ERROR: dist/index.html lost its noindex meta tag' >&2; exit 1; }

cd dist
vercel link --yes --project "$PROJECT" --scope "$SCOPE" >/dev/null
out="$(vercel deploy --prod --yes --scope "$SCOPE")"
url="$(printf '%s' "$out" | grep -Eo 'https://[^[:space:]"]+\.vercel\.app' | tail -1 || true)"
[[ -n "$url" ]] || { echo "ERROR: could not read the deployment URL from: $out" >&2; exit 1; }
echo "Deployment URL: $url"
cd "$repo_dir"

check() { # base path
  local base="$1" path="$2" hdr status
  hdr="$(mktemp)"
  status="$(curl -sS --max-time 25 --retry 4 --retry-all-errors -o /dev/null -D "$hdr" -w '%{http_code}' "$base$path")" || { rm -f "$hdr"; return 1; }
  if [[ "$status" != 200 ]]; then echo "Smoke check failed: $base$path returned HTTP $status" >&2; rm -f "$hdr"; return 1; fi
  if ! grep -qi '^x-robots-tag:.*noindex' "$hdr"; then echo "Smoke check failed: $base$path missing X-Robots-Tag noindex" >&2; rm -f "$hdr"; return 1; fi
  rm -f "$hdr"
}
# The production alias URL of the project (preview-protected URLs may answer 401).
alias_url="https://$PROJECT.vercel.app"
ok=false
for attempt in 1 2 3 4; do
  if check "$alias_url" / && check "$alias_url" /some/deep/link; then ok=true; break; fi
  echo 'Waiting for production alias propagation...' >&2; sleep 5
done
[[ "$ok" == true ]] || { echo "ERROR: smoke checks failed on $alias_url" >&2; exit 1; }
echo "Smoke checks passed on $alias_url (root + deep-link fallback, noindex header)."
if check "$SITE_URL" / 2>/dev/null; then
  echo "Live at $SITE_URL"
else
  echo "Note: $SITE_URL is not answering yet (DNS or domain still propagating); the project deployment itself is healthy."
fi
