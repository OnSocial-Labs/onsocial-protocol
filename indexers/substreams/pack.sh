#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Build Substreams packages with embedded SQL sink schemas.
# Optional args restrict packaging to matching contract variants.
# ---------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ---------------------------------------------------------------------------
# CONTRACT REGISTRY: variant|db_out_module|schema_file
# ---------------------------------------------------------------------------
CONTRACTS=(
  "combined|combined_db_out|combined_schema.sql"
  "core|core_db_out|core_schema.sql"
  "boost|boost_db_out|boost_schema.sql"
  "rewards|rewards_db_out|rewards_schema.sql"
  "token|token_db_out|token_schema.sql"
  "scarces|scarces_db_out|scarces_schema.sql"
)

# Extract version from substreams.yaml
VERSION=$(grep -m1 'version:' substreams.yaml | awk '{print $2}')
CARGO_VERSION="v$(grep -m1 '^version' Cargo.toml | sed 's/.*"\(.*\)"/\1/')"
if [ "$VERSION" != "$CARGO_VERSION" ]; then
  echo "❌ Version mismatch: substreams.yaml=${VERSION} Cargo.toml=${CARGO_VERSION}"
  exit 1
fi
echo "📦 Substreams version: ${VERSION}"

# Determine which contracts to build
if [ $# -gt 0 ]; then
  REQUESTED=("$@")
else
  REQUESTED=()
  for entry in "${CONTRACTS[@]}"; do
    REQUESTED+=("${entry%%|*}")
  done
fi

BUILT=0
for entry in "${CONTRACTS[@]}"; do
  IFS='|' read -r variant module schema <<< "$entry"

  # Skip if not requested
  if [ ${#REQUESTED[@]} -gt 0 ]; then
    FOUND=false
    for req in "${REQUESTED[@]}"; do
      [ "$req" = "$variant" ] && FOUND=true && break
    done
    [ "$FOUND" = false ] && continue
  fi

  OUTFILE="onsocial-events-${VERSION}-${variant}.spkg"
  TMPFILE=".substreams-${variant}.yaml"

  echo ""
  echo "🔨 Packing ${variant} → ${OUTFILE}"
  echo "   sink.module: ${module}"
  echo "   schema:      ${schema}"

  # Verify schema file exists
  if [ ! -f "$schema" ]; then
    echo "❌ Schema file not found: ${schema}"
    exit 1
  fi

  # Generate temporary manifest: copy base yaml + append sink block
  cp substreams.yaml "$TMPFILE"

  cat >> "$TMPFILE" <<EOF
sink:
  module: ${module}
  type: sf.substreams.sink.sql.v1.Service
  config:
    schema: "./${schema}"
EOF

  substreams pack "$TMPFILE" -o "$OUTFILE"
  rm -f "$TMPFILE"

  BUILT=$((BUILT + 1))
done

echo ""
echo "✅ Built ${BUILT} spkg(s):"
ls -lh onsocial-events-${VERSION}-*.spkg 2>/dev/null || true
