#!/usr/bin/env python3
"""Validate Substreams DatabaseChanges writes against SQL sink schemas."""

from __future__ import annotations

import re
import sys
from collections import defaultdict
from pathlib import Path


SUBSTREAMS_DIR = Path(__file__).resolve().parents[1]

INDEXED_CONTRACTS = [
    ("core", "core_db_out.rs", "core_schema.sql"),
    ("boost", "boost_db_out.rs", "boost_schema.sql"),
    ("rewards", "rewards_db_out.rs", "rewards_schema.sql"),
    ("token", "token_db_out.rs", "token_schema.sql"),
    ("scarces", "scarces_db_out.rs", "scarces_schema.sql"),
    ("social-spend", "social_spend_db_out.rs", "social_spend_schema.sql"),
]

DB_OUT_FILES = [SUBSTREAMS_DIR / "src" / db_out for _, db_out, _ in INDEXED_CONTRACTS]
STANDALONE_SCHEMA_FILES = [SUBSTREAMS_DIR / schema for _, _, schema in INDEXED_CONTRACTS]

GOLDEN_FIXTURES_PATH = SUBSTREAMS_DIR / "tests" / "golden_db_fixtures.json"


def strip_sql_comments(sql: str) -> str:
    return re.sub(r"--.*", "", sql)


def parse_sql_schema(paths: list[Path]) -> dict[str, set[str]]:
    tables: dict[str, set[str]] = defaultdict(set)

    for path in paths:
        sql = strip_sql_comments(path.read_text())

        for match in re.finditer(
            r"CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+([a-zA-Z_][\w]*)\s*\((.*?)\);",
            sql,
            re.IGNORECASE | re.DOTALL,
        ):
            table_name = match.group(1)
            table_body = match.group(2)
            for raw_column in table_body.split(","):
                column_def = raw_column.strip()
                if not column_def:
                    continue
                column_name = column_def.split()[0].strip('"')
                if column_name.upper() in {
                    "CONSTRAINT",
                    "PRIMARY",
                    "FOREIGN",
                    "UNIQUE",
                    "CHECK",
                    "EXCLUDE",
                }:
                    continue
                tables[table_name].add(column_name)

        for match in re.finditer(
            r"ALTER\s+TABLE\s+([a-zA-Z_][\w]*)\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+([a-zA-Z_][\w]*)",
            sql,
            re.IGNORECASE,
        ):
            tables[match.group(1)].add(match.group(2))

    return dict(tables)


def parse_rust_writes(paths: list[Path]) -> dict[str, set[str]]:
    table_for_row = re.compile(
        r"let\s+row\s*=\s*tables\.(?:create_row|upsert_row)\(\s*\"([^\"]+)\""
    )
    row_set = re.compile(r"\brow\.set\(\s*\"([^\"]+)\"")
    writes: dict[str, set[str]] = defaultdict(set)

    for path in paths:
        current_table: str | None = None
        for line_number, line in enumerate(path.read_text().splitlines(), start=1):
            table_match = table_for_row.search(line)
            if table_match:
                current_table = table_match.group(1)
                writes[current_table]
                continue

            set_match = row_set.search(line)
            if set_match and current_table:
                writes[current_table].add(set_match.group(1))
            elif set_match:
                raise ValueError(
                    f"{path}:{line_number}: row.set() seen before row table is known"
                )

    return dict(writes)


def parse_golden_fixture_tables(path: Path) -> set[str]:
    import json

    tables: set[str] = set()
    fixtures = json.loads(path.read_text())
    for fixture in fixtures:
        for expected_row in fixture.get("expected_rows", []):
            table_name = expected_row.get("table")
            if table_name:
                tables.add(table_name)
    return tables


def compare_schema(name: str, writes: dict[str, set[str]], schema: dict[str, set[str]]) -> list[str]:
    errors: list[str] = []
    for table_name, written_columns in sorted(writes.items()):
        if table_name not in schema:
            errors.append(f"{name}: Rust writes table {table_name!r}, but schema does not define it")
            continue

        missing_columns = sorted(written_columns - schema[table_name])
        if missing_columns:
            errors.append(
                f"{name}: table {table_name!r} is missing written columns: "
                + ", ".join(missing_columns)
            )
    return errors


def compare_combined_to_standalone(
    writes: dict[str, set[str]],
    combined_schema: dict[str, set[str]],
    standalone_schema: dict[str, set[str]],
) -> list[str]:
    errors: list[str] = []
    for table_name in sorted(writes):
        combined_columns = combined_schema.get(table_name, set())
        standalone_columns = standalone_schema.get(table_name, set())
        if combined_columns == standalone_columns:
            continue

        only_combined = sorted(combined_columns - standalone_columns)
        only_standalone = sorted(standalone_columns - combined_columns)
        if only_combined:
            errors.append(
                f"table {table_name!r} has columns only in combined_schema.sql: "
                + ", ".join(only_combined)
            )
        if only_standalone:
            errors.append(
                f"table {table_name!r} has columns only in standalone schema: "
                + ", ".join(only_standalone)
            )
    return errors


def compare_golden_fixture_coverage(writes: dict[str, set[str]], fixture_tables: set[str]) -> list[str]:
    errors: list[str] = []
    written_tables = set(writes)

    missing_tables = sorted(written_tables - fixture_tables)
    stale_tables = sorted(fixture_tables - written_tables)

    if missing_tables:
        errors.append(
            "golden_db_fixtures.json is missing rows for written tables: "
            + ", ".join(missing_tables)
        )
    if stale_tables:
        errors.append(
            "golden_db_fixtures.json references tables no longer written by DB outputs: "
            + ", ".join(stale_tables)
        )

    return errors


def main() -> int:
    writes = parse_rust_writes(DB_OUT_FILES)
    combined_schema = parse_sql_schema([SUBSTREAMS_DIR / "combined_schema.sql"])
    standalone_schema = parse_sql_schema(STANDALONE_SCHEMA_FILES)
    fixture_tables = parse_golden_fixture_tables(GOLDEN_FIXTURES_PATH)

    errors = []
    errors.extend(compare_schema("combined_schema.sql", writes, combined_schema))
    errors.extend(compare_schema("standalone schemas", writes, standalone_schema))
    errors.extend(compare_combined_to_standalone(writes, combined_schema, standalone_schema))
    errors.extend(compare_golden_fixture_coverage(writes, fixture_tables))

    if errors:
        print("Substreams DB schema parity check failed:", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return 1

    written_column_count = sum(len(columns) for columns in writes.values())
    print(
        "Substreams DB schema parity passed: "
        f"{len(writes)} tables, {written_column_count} written columns"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())