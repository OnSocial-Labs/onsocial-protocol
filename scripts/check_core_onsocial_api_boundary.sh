#!/bin/bash
set -euo pipefail

# Guardrail: ensure `#[near] impl Contract` blocks live only under `contracts/core-onsocial/src/api`.
# We enforce this by scanning all Rust files outside that directory and failing
# if we see an attribute line exactly `#[near]` followed shortly by `impl Contract`.

ROOT_DIR="${1:-contracts/core-onsocial/src}"
ALLOWED_DIR="$ROOT_DIR/api"

if [ ! -d "$ROOT_DIR" ]; then
  echo "ERROR: core-onsocial src not found at: $ROOT_DIR" >&2
  exit 2
fi

bad=0
# shellcheck disable=SC2016
while IFS= read -r -d '' file; do
  # Skip anything under api/
  case "$file" in
    "$ALLOWED_DIR"/*) continue ;;
  esac

  # Detect a near-annotated Contract impl outside api.
  # We only match the exact attribute form `#[near]` to avoid false positives
  # like `#[near(contract_state)]`.
  if awk '
    function is_near_attr(line) { return line ~ /^[[:space:]]*#[[:space:]]*\[[[:space:]]*near[[:space:]]*\][[:space:]]*$/ }
    function is_contract_impl(line) { return line ~ /^[[:space:]]*impl[[:space:]]+((crate::)?Contract)\b/ }
    BEGIN { window=0; bad=0 }
    {
      if (window > 0) {
        # allow blank lines and doc comments between attribute and impl
        if (is_contract_impl($0)) { bad=1; exit 1 }
        if ($0 !~ /^[[:space:]]*($|\/\/\/|\/\*|\*\/|\*)/) { window = window - 1 } else { window = window - 1 }
      }
      if (is_near_attr($0)) { window=6 }
    }
    END { exit bad }
  ' "$file"; then
    :
  else
    echo "ERROR: Found `#[near] impl Contract` outside api entrypoints layer: $file" >&2
    bad=1
  fi

done < <(find "$ROOT_DIR" -type f -name '*.rs' -print0)

if [ "$bad" -ne 0 ]; then
  echo "Guardrail failed: move the entrypoints into $ALLOWED_DIR" >&2
  exit 1
fi

echo "OK: core-onsocial entrypoints are confined to $ALLOWED_DIR"
