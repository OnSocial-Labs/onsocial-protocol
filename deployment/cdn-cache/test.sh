#!/usr/bin/env bash
# Render the CDN edge config for both networks, validate it, then prove the
# shared disk cache: a second GET is a HIT, and an error is never stored.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CACHE_DIR="$ROOT/deployment/cdn-cache"
WORK="$CACHE_DIR/work"
ART="${ART:-/opt/cursor/artifacts}"
IMAGE="${CADDY_IMAGE:-onsocial-caddy:cdn-cache-test}"
PROJECT="${COMPOSE_PROJECT:-cdn-cache-proof}"
COMPOSE=(docker compose -p "$PROJECT" -f "$CACHE_DIR/docker-compose.test.yml")
UPSTREAM_HOST="statistical-barnacle-3ny44.lighthouseweb3.xyz"
EDGE="http://127.0.0.1:18080"
COUNTS="http://127.0.0.1:18081/counts"

mkdir -p "$ART" "$WORK/certs" "$WORK/rendered"
exec > >(tee "$ART/cdn-cache-test.log") 2>&1

render() {
  local names="$1" pages="$2" cdn="$3" upstream="$4" out="$5"
  sed \
    -e "s/__SERVER_NAMES__/${names}/g" \
    -e "s|__PAGES_HOST_PATTERNS__|${pages}|g" \
    -e "s|__CDN_DOMAIN__|${cdn}|g" \
    -e "s|__CDN_UPSTREAM__|${upstream}|g" \
    -e 's/__BACKEND_UPSTREAM__/backend:4001/g' \
    -e 's/__GATEWAY_UPSTREAM__/gateway-api:8080/g' \
    "$ROOT/deployment/Caddyfile" > "$out"
}

require_rendered() {
  local file="$1" cdn="$2" api="$3"
  if grep -n '__[A-Z0-9_]*__' "$file"; then
    echo "rendered config still has placeholders: $file" >&2
    exit 1
  fi
  awk -v cdn="$cdn" -v api="$api" '
    $0 ~ api { if (!api_at) api_at = NR }
    $0 ~ ("^" cdn " \\{") { if (!cdn_at) cdn_at = NR }
    /^https:\/\/ \{/ { if (!pages_at) pages_at = NR }
    END {
      if (!(api_at && cdn_at && pages_at)) {
        print "missing a host block" > "/dev/stderr"
        exit 1
      }
      if (!(api_at < cdn_at && cdn_at < pages_at)) {
        print "host block order changed" > "/dev/stderr"
        exit 1
      }
    }
  ' "$file"
  local needle
  for needle in \
    "reverse_proxy cdn-cache:8080" \
    "X-Cache-Key" \
    "X-Cdn-Upstream" \
    "zone cdn_per_ip" \
    "response_header_timeout 30s" \
    "header_down -Access-Control-Allow-Origin" \
    "header_down -Access-Control-Allow-Methods" \
    "header_down -Cache-Control" \
    'Cache-Control "public, max-age=31536000, immutable"' \
    'Cache-Control "no-store"' \
    "reverse_proxy gateway-api:8080" \
    "reverse_proxy backend:4001" \
    "reverse_proxy pages:3456"
  do
    if ! grep -q -F "$needle" "$file"; then
      echo "rendered config missing: $needle" >&2
      exit 1
    fi
  done
  local proxies
  proxies="$(grep -c -F 'reverse_proxy cdn-cache:8080' "$file")"
  if [ "$proxies" != "2" ]; then
    echo "expected the cache in front of /ipfs and /img, found $proxies" >&2
    exit 1
  fi
}

validate_one() {
  local file="$1" label="$2"
  echo "---- caddy validate ($label) ----"
  docker run --rm \
    -v "$file:/etc/caddy/Caddyfile:ro" \
    "$IMAGE" \
    caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
}

echo "---- build edge image ----"
docker build -t "$IMAGE" -f "$ROOT/docker/Dockerfile.caddy" "$ROOT/docker"

render \
  "testnet.onsocial.id" "*.testnet.onsocial.id" "cdn.testnet.onsocial.id" \
  "$UPSTREAM_HOST" "$WORK/rendered/testnet.Caddyfile"
render \
  "api.onsocial.id, mainnet.onsocial.id" "*.onsocial.id" "cdn.onsocial.id" \
  "$UPSTREAM_HOST" "$WORK/rendered/mainnet.Caddyfile"
require_rendered "$WORK/rendered/testnet.Caddyfile" "cdn.testnet.onsocial.id" "testnet.onsocial.id"
require_rendered "$WORK/rendered/mainnet.Caddyfile" "cdn.onsocial.id" "api.onsocial.id"
validate_one "$WORK/rendered/testnet.Caddyfile" testnet
validate_one "$WORK/rendered/mainnet.Caddyfile" mainnet
cp "$WORK/rendered/testnet.Caddyfile" "$ART/caddyfile.testnet"
cp "$WORK/rendered/mainnet.Caddyfile" "$ART/caddyfile.mainnet"

echo "---- live CDN block ----"
render \
  "testnet.onsocial.id" "*.testnet.onsocial.id" "cdn.testnet.onsocial.id" \
  "gateway" "$WORK/rendered/live-source.Caddyfile"
awk '
  $0 ~ /^cdn\.testnet\.onsocial\.id \{/ { printing = 1; print ":8080 {"; next }
  /^# ---------- Pages/ { printing = 0 }
  printing { print }
' "$WORK/rendered/live-source.Caddyfile" > "$WORK/Caddyfile"
if ! grep -q 'reverse_proxy cdn-cache:8080' "$WORK/Caddyfile"; then
  echo "live CDN block was not extracted" >&2
  exit 1
fi

openssl req -x509 -newkey rsa:2048 \
  -keyout "$WORK/certs/stub.key" -out "$WORK/certs/stub.crt" \
  -days 2 -nodes -subj "/CN=gateway" \
  -addext "subjectAltName=DNS:gateway" >/dev/null 2>&1

cleanup() {
  "${COMPOSE[@]}" logs --tail=200 > "$ART/cdn-cache-compose.log" 2>&1 || true
  "${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

"${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
"${COMPOSE[@]}" up -d --wait

# shellcheck disable=SC2016
fetch() {
  local host="$1" path="$2"
  shift 2
  local headers="$WORK/headers" body="$WORK/body"
  local status
  status="$(curl -sS -D "$headers" -o "$body" \
    -H "Host: $host" \
    "$@" \
    "$EDGE$path")"
  STATUS="$(awk 'BEGIN { code = "" } /^HTTP\// { code = $2 } END { print code }' "$headers" | tr -d '\r')"
  XCACHE="$(awk 'tolower($1) == "x-cache:" { print $2 }' "$headers" | tr -d '\r')"
  XCACHE_N="$(printf '%s\n' "$XCACHE" | grep -c . || true)"
  ACAO="$(awk 'tolower($1) == "access-control-allow-origin:" { print $2 }' "$headers" | tr -d '\r')"
  CC="$(awk 'BEGIN { IGNORECASE = 1 } tolower($1) == "cache-control:" { sub(/\r/, "", $0); sub(/^[^:]*:[[:space:]]*/, "", $0); print }' "$headers")"
  SERVER="$(awk 'tolower($1) == "server:" { print $2 }' "$headers" | tr -d '\r')"
  BODY="$(cat "$body")"
  printf 'GET %s host=%s -> %s x-cache=%s cache-control=%s\n' "$path" "$host" "$STATUS" "$XCACHE" "$CC"
  printf '%s' "$status" >/dev/null
}

count_of() {
  python3 - "$1" <<'PY'
import json, sys, urllib.request
path = sys.argv[1]
with urllib.request.urlopen("http://127.0.0.1:18081/counts", timeout=5) as response:
    counts = json.load(response)
print(counts.get(path, 0))
PY
}

fail() {
  echo "FAIL $1" >&2
  echo "body: ${BODY:-}" >&2
  echo "---- cache logs ----" >&2
  "${COMPOSE[@]}" logs --tail=80 cdn-cache >&2 || true
  echo "---- edge logs ----" >&2
  "${COMPOSE[@]}" logs --tail=80 caddy >&2 || true
  echo "---- origin logs ----" >&2
  "${COMPOSE[@]}" logs --tail=80 origin >&2 || true
  exit 1
}

expect() {
  local label="$1" actual="$2" wanted="$3"
  if [ "$actual" != "$wanted" ]; then
    fail "$label: expected [$wanted] got [$actual]"
  fi
}

# /ipfs keeps the upstream Cache-Control and sets the immutable policy beside
# it. Either line satisfies the contract; /img replaces the upstream value.
expect_has() {
  local label="$1" actual="$2" needle="$3"
  case "$actual" in
    *"$needle"*) ;;
    *) fail "$label: expected to contain [$needle] got [$actual]" ;;
  esac
}

echo "---- success is MISS then HIT, query and Accept do not split the key ----"
fetch "cdn.testnet.onsocial.id" "/ipfs/pic" -H "Accept: text/plain"
expect "ipfs first status" "$STATUS" "200"
expect "ipfs first cache" "$XCACHE" "MISS"
expect "ipfs first cache count" "$XCACHE_N" "1"
expect "ipfs origin leaked upstream" "$BODY" "200|1|up=-|key=-|host=gateway|path=/ipfs/pic"
expect "ipfs acao" "$ACAO" "*"
expect_has "ipfs cache-control" "$CC" "public, max-age=31536000, immutable"
expect "ipfs server header" "$SERVER" ""
pic_after_first="$(count_of /ipfs/pic)"
expect "ipfs upstream fetches" "$pic_after_first" "1"

fetch "cdn.testnet.onsocial.id" "/ipfs/pic?foo=1" \
  -H "Accept: image/avif" -H "X-Cache-Key: attacker"
expect "ipfs second status" "$STATUS" "200"
expect "ipfs second cache" "$XCACHE" "HIT"
expect "ipfs second body" "$BODY" "200|1|up=-|key=-|host=gateway|path=/ipfs/pic"
expect "ipfs query did not refetch" "$(count_of /ipfs/pic)" "1"

echo "---- host is part of the key ----"
fetch "cdn.onsocial.id" "/ipfs/pic"
expect "other host first" "$XCACHE" "MISS"
expect "other host fetched" "$(count_of /ipfs/pic)" "2"
fetch "cdn.onsocial.id" "/ipfs/pic"
expect "other host second" "$XCACHE" "HIT"
expect "other host stayed cached" "$(count_of /ipfs/pic)" "2"

echo "---- errors are never stored ----"
for cid in payment forbidden missing gateway-timeout upstream-error; do
  case "$cid" in
    payment) code=402 ;;
    forbidden) code=403 ;;
    missing) code=404 ;;
    gateway-timeout) code=504 ;;
    upstream-error) code=500 ;;
  esac
  path="/ipfs/$cid"
  before="$(count_of "$path")"
  fetch "cdn.testnet.onsocial.id" "$path"
  expect "$cid first status" "$STATUS" "$code"
  expect "$cid first cache" "$XCACHE" "MISS"
  mid="$(count_of "$path")"
  expect "$cid first fetch" "$mid" "$((before + 1))"
  fetch "cdn.testnet.onsocial.id" "$path"
  expect "$cid second status" "$STATUS" "$code"
  expect "$cid second cache" "$XCACHE" "MISS"
  after="$(count_of "$path")"
  expect "$cid was not stored" "$after" "$((before + 2))"
done

echo "---- resized images ----"
fetch "cdn.testnet.onsocial.id" "/img/128/ipfs/photo" -H "Accept: image/avif"
expect "img status" "$STATUS" "200"
expect "img cache" "$XCACHE" "MISS"
expect "img cache-control" "$CC" "public, max-age=31536000, immutable"
expect "img acao" "$ACAO" "*"
expect "img upstream host" "$BODY" "200|1|up=-|key=-|host=imgproxy:8080|path=/insecure/resize:fit:128:0/plain/https://gateway/ipfs/photo"
expect "img fetches" "$(count_of /insecure/resize:fit:128:0/plain/https://gateway/ipfs/photo)" "1"
fetch "cdn.testnet.onsocial.id" "/img/128/ipfs/photo?w=1" -H "Accept: image/webp"
expect "img second cache" "$XCACHE" "HIT"
expect "img accept did not refetch" "$(count_of /insecure/resize:fit:128:0/plain/https://gateway/ipfs/photo)" "1"

fetch "cdn.testnet.onsocial.id" "/img/128/avif/ipfs/photo"
expect "format path is its own fill" "$XCACHE" "MISS"
expect "format path fetched" "$(count_of /insecure/resize:fit:128:0/format:avif/plain/https://gateway/ipfs/photo)" "1"
fetch "cdn.testnet.onsocial.id" "/img/128/avif/ipfs/photo"
expect "format path hit" "$XCACHE" "HIT"

# The variant allowlist only accepts an alphanumeric cid, so the 504
# fixture cannot use a hyphen the way the content route can.
for cid in payment forbidden missing gwtimeout; do
  case "$cid" in
    payment) code=402 ;;
    forbidden) code=403 ;;
    missing) code=404 ;;
    gwtimeout) code=504 ;;
  esac
  path="/img/384/ipfs/$cid"
  upstream="/insecure/resize:fit:384:0/plain/https://gateway/ipfs/$cid"
  fetch "cdn.testnet.onsocial.id" "$path"
  expect "img $cid status" "$STATUS" "$code"
  expect "img $cid cache" "$XCACHE" "MISS"
  expect "img $cid no-store" "$CC" "no-store"
  fetch "cdn.testnet.onsocial.id" "$path"
  expect "img $cid second cache" "$XCACHE" "MISS"
  expect "img $cid not stored" "$(count_of "$upstream")" "2"
done

echo "---- disallowed width never reaches the cache ----"
fetch "cdn.testnet.onsocial.id" "/img/999/ipfs/photo"
expect "bad width status" "$STATUS" "404"
expect "bad width cache" "$XCACHE" "MISS"
expect "bad width did not fetch" "$(count_of /insecure/resize:fit:999:0/plain/https://gateway/ipfs/photo)" "0"

echo "---- HEAD fills the same object and does not store an empty body ----"
fetch "cdn.testnet.onsocial.id" "/ipfs/headme" -I
expect "head cache" "$XCACHE" "MISS"
expect "head status" "$STATUS" "200"
fetch "cdn.testnet.onsocial.id" "/ipfs/headme"
expect "get after head" "$XCACHE" "HIT"
expect "get after head status" "$STATUS" "200"
expect "get after head body" "$BODY" "200|1|up=-|key=-|host=gateway|path=/ipfs/headme"
expect "head did not fetch twice" "$(count_of /ipfs/headme)" "1"

echo "---- disk cache survives a restart ----"
"${COMPOSE[@]}" restart cdn-cache
ready=0
for _ in $(seq 1 30); do
  cid="$("${COMPOSE[@]}" ps -q cdn-cache)"
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid")"
  if [ "$health" = "healthy" ]; then
    ready=1
    break
  fi
  sleep 1
done
if [ "$ready" != "1" ]; then
  echo "cache did not become healthy after restart ($health)" >&2
  exit 1
fi
fetch "cdn.testnet.onsocial.id" "/ipfs/pic"
expect "hit after restart" "$XCACHE" "HIT"
expect "restart did not refetch" "$(count_of /ipfs/pic)" "2"
fetch "cdn.testnet.onsocial.id" "/ipfs/missing"
expect "error still uncached after restart" "$XCACHE" "MISS"
expect "error refetched after restart" "$(count_of /ipfs/missing)" "3"

echo "---- OK ----"
