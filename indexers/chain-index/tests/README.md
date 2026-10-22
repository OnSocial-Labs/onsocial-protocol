# Chain index test fixtures

This directory contains deterministic test inputs for the indexer correctness
gates. It does not contain live Hasura or testnet scripts.

## Files

```
tests/
  event_manifest.json     # Indexed event surface expected from contract emitters
  golden_db_fixtures.json # EVENT_JSON fixtures with expected database rows
```

## Gates

Static event-surface drift check:

```bash
python3 ../scripts/check_event_manifest.py
```

This compares `event_manifest.json` with current contract event emitters.

Golden DB mapping fixtures:

```bash
cargo test golden_db
```

These fixtures drive real EVENT_JSON through decoder and DB writer code and
assert the expected rows without Hasura, RPC, funded accounts, or shared
testnet state.

Full indexer check from the repository root:

```bash
make check-indexer
```

That target runs event-surface drift validation, DB writer/schema/fixture parity,
the Rust test suite, and disposable PostgreSQL SQL validation.

## Adding A Contract

Add the contract to each deterministic layer in the same change:

- Decoder module and DB output writer.
- Combined and standalone SQL schemas.
- `INDEXED_CONTRACTS` in `../scripts/check_db_schema_parity.py`.
- `event_manifest.json` and `../scripts/check_event_manifest.py` emitter extraction.
- Golden EVENT_JSON fixtures for every new table written by the DB output.
- Rust decoder, pipeline, and DB output tests.

`make check-indexer` fails if the DB writer, SQL schema, fixture table
coverage, Rust tests, or event manifest drift out of sync.
