#!/usr/bin/env bash
# check-substreams-event-coverage.sh
#
# CI-ready script that verifies every NEP-297 event emitted by OnSocial
# contracts has a matching decoder arm in the substreams indexer.
#
# Exit 0 = all events covered.  Exit 1 = gaps found.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONTRACTS="$ROOT/contracts"
SUBSTREAMS="$ROOT/indexers/substreams/src"
ERRORS=0

red()   { printf "\033[31m%s\033[0m\n" "$1"; }
green() { printf "\033[32m%s\033[0m\n" "$1"; }
dim()   { printf "\033[90m%s\033[0m\n" "$1"; }

check_flat_events() {
    local label="$1"
    local contract_events="$2"
    local decoder_events="$3"

    echo ""
    echo "── $label ──"

    local missing=0
    while IFS= read -r event; do
        [ -z "$event" ] && continue
        if echo "$decoder_events" | grep -qxF "$event"; then
            dim "  ✓ $event"
        else
            red "  ✗ $event  (missing in decoder)"
            missing=$((missing + 1))
        fi
    done <<< "$contract_events"

    # Reverse check: decoder has events not in contract
    while IFS= read -r event; do
        [ -z "$event" ] && continue
        if ! echo "$contract_events" | grep -qxF "$event"; then
            red "  ⚠ $event  (in decoder but not in contract)"
            missing=$((missing + 1))
        fi
    done <<< "$decoder_events"

    if [ "$missing" -eq 0 ]; then
        green "  All events covered"
    else
        ERRORS=$((ERRORS + missing))
    fi
}

# ─── Boost ───────────────────────────────────────────────────────────
boost_contract=$(
    grep -A1 '\.emit_event(' "$CONTRACTS/boost-onsocial/src/lib.rs" \
    | grep -oP '"[A-Z_]+"' | tr -d '"' | sort -u
)
boost_decoder=$(
    grep -oP '"[A-Z_]+" =>' "$SUBSTREAMS/boost_decoder.rs" \
    | grep -oP '[A-Z_]+' | sort -u
)
check_flat_events "boost-onsocial" "$boost_contract" "$boost_decoder"

# ─── Rewards ─────────────────────────────────────────────────────────
rewards_contract=$(
    grep -P '^\s*"[A-Z_]+"' "$CONTRACTS/rewards-onsocial/src/events.rs" \
    | grep -oP '[A-Z_]+' | sort -u
)
rewards_decoder=$(
    grep -oP '"[A-Z_]+" =>' "$SUBSTREAMS/rewards_decoder.rs" \
    | grep -oP '[A-Z_]+' | sort -u
)
check_flat_events "rewards-onsocial" "$rewards_contract" "$rewards_decoder"

# ─── Token (NEP-141) ────────────────────────────────────────────────
token_contract="ft_burn
ft_mint
ft_transfer"
token_decoder=$(
    grep -oP '"ft_[a-z_]+" =>' "$SUBSTREAMS/token_decoder.rs" \
    | grep -oP 'ft_[a-z_]+' | sort -u
)
check_flat_events "token-onsocial (NEP-141)" "$token_contract" "$token_decoder"

# ─── Core (two-level: event types) ──────────────────────────────────
core_contract=$(
    grep -oP 'pub const EVENT_TYPE_[A-Z_]+.*"([A-Z_]+)"' \
        "$CONTRACTS/core-onsocial/src/constants.rs" \
    | grep -oP '"[A-Z_]+"' | tr -d '"' | sort -u
)
# Core decoder is generic (accepts any onsocial event type).
# Verify the proto Output message has a field for each event type.
echo ""
echo "── core-onsocial (two-level) ──"
core_proto="$ROOT/indexers/substreams/proto/core.proto"
core_missing=0
while IFS= read -r event; do
    [ -z "$event" ] && continue
    # Convert DATA_UPDATE → DataUpdate for proto message lookup
    proto_name=$(echo "$event" | sed 's/_\(.\)/\U\1/g; s/^\(.\)/\U\1/')
    if grep -q "message $proto_name" "$core_proto" 2>/dev/null || \
       grep -qi "$event" "$core_proto" 2>/dev/null; then
        dim "  ✓ $event → $proto_name"
    else
        red "  ✗ $event → $proto_name (missing in proto)"
        core_missing=$((core_missing + 1))
    fi
done <<< "$core_contract"
if [ "$core_missing" -eq 0 ]; then
    green "  All event types covered"
else
    ERRORS=$((ERRORS + core_missing))
fi

# ─── Scarces (two-level: event types) ───────────────────────────────
scarces_contract=$(
    grep -oP 'const [A-Z_]+:\s*&str\s*=\s*"([A-Z_]+)"' \
        "$CONTRACTS/scarces-onsocial/src/events/mod.rs" \
    | grep -oP '"[A-Z_]+"' | tr -d '"' \
    | grep -v '^onsocial$\|^1\.0\.0$' | sort -u
)
scarces_decoder=$(
    grep -oP '"[A-Z_]+"' "$SUBSTREAMS/scarces_decoder.rs" \
    | tr -d '"' | grep '_UPDATE$\|_EVENT$' | sort -u
)
check_flat_events "scarces-onsocial (event types)" "$scarces_contract" "$scarces_decoder"

# ─── Summary ────────────────────────────────────────────────────────
echo ""
if [ "$ERRORS" -eq 0 ]; then
    green "═══ All contract events are covered by substreams decoders ═══"
    exit 0
else
    red "═══ $ERRORS event coverage gap(s) found ═══"
    exit 1
fi
