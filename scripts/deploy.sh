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

# Both public aliases must serve this build, even if Vercel protects the unique URL.
bash scripts/check-deployment.sh "$url" "https://$PROJECT.vercel.app" "$SITE_URL"
