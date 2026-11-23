#!/usr/bin/env bash
set -Eeuo pipefail

# Vite emits root-relative, double-quoted URLs for the planner's entry files.
assets() {
  grep -Eo '(src|href)="/[^"]+"' "$1" | cut -d '"' -f 2 | sort -u
}
build_id() {
  sed -n 's/.*<meta name="planner-build-id" content="\([^"]*\)".*/\1/p' "$1"
}
expected=$(assets dist/index.html) || { echo 'ERROR: no built assets in dist/index.html' >&2; exit 1; }
identity=$(build_id dist/index.html)
[[ -n "$identity" ]] || { echo 'ERROR: no build identity in dist/index.html' >&2; exit 1; }
scratch=$(mktemp -d)
trap 'rm -rf -- "$scratch"' EXIT
fetch() {
  local url="$1" code rc
  if code=$(curl -sS --max-time 25 -o "$scratch/body" -D "$scratch/headers" -w '%{http_code}' "$url"); then
    [[ "$code" == 200 ]] && return 0
    if [[ "${2:-}" == immutable && "$code" =~ ^(302|401|403)$ ]] &&
       grep -Eqi '^location:[[:blank:]]*https://(www\.)?vercel\.com/(sso-api|sso|login)([/?#]|[[:space:]]*$)' "$scratch/headers"; then
      echo "$url (HTTP $code, Vercel sign-in): protected, skipped"
      return 3
    fi
    echo "Smoke check failed: $url (HTTP $code)" >&2
  else
    rc=$?
    echo "Smoke check failed: $url (curl exit $rc)" >&2
  fi
  return 1
}
check_document() {
  fetch "$@" || return $?
  if ! grep -qi '^x-robots-tag:.*noindex' "$scratch/headers" ||
     [[ "$(build_id "$scratch/body")" != "$identity" || "$(assets "$scratch/body")" != "$expected" ]]; then
    echo "Smoke check failed: $1 (expected current build and noindex)" >&2
    return 1
  fi
}
check_assets() {
  local asset mime
  while IFS= read -r asset; do
    fetch "$1$asset" "${2:-}" || return $?
    if ! cmp -s -- "$scratch/body" "dist$asset"; then
      echo "Smoke check failed: $asset differs from dist" >&2
      return 1
    fi
    case "$asset" in
      *.js) mime='(text|application)/(javascript|ecmascript)' ;;
      *.css) mime='text/css' ;;
      *) continue ;;
    esac
    if ! grep -Eqi "^content-type:[[:blank:]]*$mime([[:space:]]*;.*|[[:space:]]*)$" "$scratch/headers"; then
      echo "Smoke check failed: unexpected content type for $asset" >&2
      return 1
    fi
  done <<< "$expected"
}
verify_site() {
  local base="$1" kind="${2:-}" attempt
  for attempt in 1 2 3 4; do
    if check_document "$base/" "$kind" &&
       check_document "$base/some/deep/link" "$kind" &&
       check_assets "$base" "$kind"; then
      echo "Smoke checks passed on $base (current build, entry assets, root + deep link, noindex)."
      return 0
    elif (( $? == 3 )); then
      return 0
    fi
    if (( attempt < 4 )); then sleep 5; fi
  done
  echo "ERROR: $base did not serve the tested build" >&2
  return 1
}
# deploy.sh supplies the immutable URL before the usual alias and custom domain.
if (( $# == 3 )); then
  if [[ "$1" != "$2" && "$1" != "$3" ]]; then
    if [[ "$1" =~ ^https://[a-zA-Z0-9-]+\.vercel\.app$ ]]; then
      verify_site "$1" immutable
    else
      verify_site "$1"
    fi
  fi
  shift
fi
verify_site "$1"
if [[ "$2" != "$1" ]]; then
  verify_site "$2"
fi
