#!/usr/bin/env python3
"""Validate Substreams event manifest against contract event emitters."""

from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from pathlib import Path


SUBSTREAMS_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = SUBSTREAMS_DIR.parents[1]
MANIFEST_PATH = SUBSTREAMS_DIR / "tests" / "event_manifest.json"


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def ordered_unique(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value not in seen:
            result.append(value)
            seen.add(value)
    return result


def compare(label: str, expected: list[str], actual: list[str]) -> list[str]:
    expected_set = set(expected)
    actual_set = set(actual)
    errors: list[str] = []

    missing = [value for value in actual if value not in expected_set]
    stale = [value for value in expected if value not in actual_set]

    if missing:
        errors.append(f"{label}: missing from manifest: {', '.join(missing)}")
    if stale:
        errors.append(f"{label}: stale in manifest: {', '.join(stale)}")
    return errors


def extract_core_event_types() -> list[str]:
    constants = read(REPO_ROOT / "contracts" / "core-onsocial" / "src" / "constants.rs")
    return ordered_unique(
        re.findall(r'EVENT_TYPE_[A-Z_]+:\s*&str\s*=\s*"([A-Z_]+)"', constants)
    )


def extract_boost_event_types() -> list[str]:
    source = read(REPO_ROOT / "contracts" / "boost-onsocial" / "src" / "lib.rs")
    return ordered_unique(
        re.findall(r'\bemit_event\(\s*"([A-Z][A-Z0-9_]+)"', source, flags=re.S)
    )


def extract_rewards_event_types() -> list[str]:
    events: list[str] = []
    src = REPO_ROOT / "contracts" / "rewards-onsocial" / "src"
    for path in sorted(src.glob("*.rs")):
        events.extend(re.findall(r'\bemit\(\s*"([A-Z][A-Z0-9_]+)"', read(path), flags=re.S))
    return ordered_unique(events)


def extract_token_event_types() -> list[str]:
    source = read(REPO_ROOT / "contracts" / "token-onsocial" / "src" / "lib.rs")
    events: list[str] = []
    if "FtMint" in source:
        events.append("ft_mint")
    if "FtBurn" in source:
        events.append("ft_burn")
    if re.search(r"impl\s+[^\n{]*FungibleTokenCore\s+for\s+Contract", source) and re.search(
        r"\bfn\s+ft_transfer\b", source
    ):
        events.append("ft_transfer")
    return events


def extract_scarces_operations() -> dict[str, list[str]]:
    events_dir = REPO_ROOT / "contracts" / "scarces-onsocial" / "src" / "events"
    constants = dict(
        re.findall(
            r'const\s+([A-Z_]+):\s*&str\s*=\s*"([A-Z_]+)"',
            read(events_dir / "mod.rs"),
        )
    )

    operations: dict[str, list[str]] = defaultdict(list)
    for path in sorted(events_dir.glob("*.rs")):
        source = read(path)
        for const_name, operation in re.findall(
            r'EventBuilder::new\(\s*([A-Z_]+)\s*,\s*"([a-z0-9_]+)"',
            source,
            flags=re.S,
        ):
            event_type = constants.get(const_name)
            if event_type:
                operations[event_type].append(operation)

    return {event_type: ordered_unique(values) for event_type, values in operations.items()}


def extract_social_spend_event_types() -> list[str]:
    source = read(REPO_ROOT / "contracts" / "social-spend-onsocial" / "src" / "lib.rs")
    return ordered_unique(
        re.findall(r'\bemit\(\s*"([A-Z][A-Z0-9_]+)"', source, flags=re.S)
    )


def main() -> int:
    manifest = json.loads(read(MANIFEST_PATH))["indexed_contracts"]
    errors: list[str] = []

    errors.extend(compare("core event types", manifest["core"]["event_types"], extract_core_event_types()))
    errors.extend(compare("boost event types", manifest["boost"]["event_types"], extract_boost_event_types()))
    errors.extend(
        compare("rewards event types", manifest["rewards"]["event_types"], extract_rewards_event_types())
    )
    errors.extend(compare("token event types", manifest["token"]["event_types"], extract_token_event_types()))
    errors.extend(
        compare(
            "social-spend event types",
            manifest["social-spend"]["event_types"],
            extract_social_spend_event_types(),
        )
    )

    scarces_expected = manifest["scarces"]["events"]
    scarces_actual = extract_scarces_operations()
    errors.extend(
        compare("scarces event types", list(scarces_expected.keys()), list(scarces_actual.keys()))
    )
    for event_type in sorted(set(scarces_expected) | set(scarces_actual)):
        errors.extend(
            compare(
                f"scarces {event_type} operations",
                scarces_expected.get(event_type, []),
                scarces_actual.get(event_type, []),
            )
        )

    if errors:
        print("Substreams event manifest drift detected:", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return 1

    print("Substreams event manifest matches contract emitters")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())