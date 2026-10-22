# OnSocial chain index

Decodes NEP-297 JSON event logs from the OnSocial NEAR contracts and writes them
to PostgreSQL. The node indexer and the neardata reader both use this crate.

## Indexed Contracts

This package indexes **6 contracts**. Other contracts in the workspace
(`manager-proxy-onsocial`, `mock-ft`, `intents-onsocial`, and `vesting-onsocial`)
are intentionally **not** included here.

| Contract              | Standard      | Event types | Decoder                                              | DB writer            | Schema                                             |
| --------------------- | ------------- | ----------- | ---------------------------------------------------- | -------------------- | -------------------------------------------------- |
| `core-onsocial`       | `onsocial` v1 | 5           | [src/core_decoder.rs](src/core_decoder.rs)           | `core_db_out`        | [core_schema.sql](core_schema.sql)                 |
| `boost-onsocial`      | `onsocial` v1 | 14          | [src/boost_decoder.rs](src/boost_decoder.rs)         | `boost_db_out`       | [boost_schema.sql](boost_schema.sql)               |
| `rewards-onsocial`    | `onsocial` v1 | 12          | [src/rewards_decoder.rs](src/rewards_decoder.rs)     | `rewards_db_out`     | [rewards_schema.sql](rewards_schema.sql)           |
| `scarces-onsocial`    | `onsocial` v1 | 7           | [src/scarces_decoder.rs](src/scarces_decoder.rs)     | `scarces_db_out`     | [scarces_schema.sql](scarces_schema.sql)           |
| `token-onsocial`      | `nep141` v1   | 3           | [src/token_decoder.rs](src/token_decoder.rs)         | `token_db_out`       | [token_schema.sql](token_schema.sql)               |
| `social-spend`        | `onsocial` v1 | 14          | [src/social_spend_decoder.rs](src/social_spend_decoder.rs) | `social_spend_db_out` | [social_spend_schema.sql](social_spend_schema.sql) |

A combined module (`map_combined_output` / `combined_db_out`) routes all six
contracts through one decode path.

## Event Format

All custom contracts emit standard [NEP-297](https://nomicon.io/Standards/EventsFormat)
JSON logs with the prefix `EVENT_JSON:`:

```text
EVENT_JSON:{"standard":"onsocial","version":"1.0.0","event":"DATA_UPDATE","data":[{...}]}
```

The token contract emits the standard NEP-141 events (`ft_mint`, `ft_burn`,
`ft_transfer`).

## Writers

Two binaries use this crate and write the same Postgres tables. One of them owns the chain tip.

- **Node indexer** (`indexers/onsocial-indexer`) reads blocks from the self-hosted NEAR node. Its cursor id is `indexer`.
- **Neardata reader** (`neardata_reader`, unit file [`onsocial-neardata-reader.service`](onsocial-neardata-reader.service)) fills historical blocks, then exits at its `--end-block`. Its cursor id is `neardata_reader`. That stop height is the first height the node indexer owns. Leave the reader stopped once it reaches that height.

`scripts/ci-apply-indexer-schema.sh` applies the schema files in this directory. SQL in [`migrations/`](migrations/) is for a database that already has an older indexer schema. A fresh database uses the current schema files.

## Checks

From the repository root:

```bash
make check-indexer
```

That runs the event manifest, schema parity, the Rust tests, and SQL validation against a disposable PostgreSQL 16 database.

Individual checks: `make check-indexer-events`, `make check-indexer-schema`, `make check-indexer-rust`, `make check-indexer-sql`.

From this directory:

```bash
cargo test
bash scripts/validate_sql.sh
python3 scripts/check_event_manifest.py
python3 scripts/check_db_schema_parity.py
```

See [`tests/README.md`](tests/README.md) for the fixture inputs.

## Module Outputs

Per-contract typed maps emit a protobuf `Output` defined in [`proto/`](proto):

- `core_onsocial.v1.Output` — `data_updates`, `storage_updates`, `group_updates`,
  `contract_updates`, `permission_updates`.
- `boost.v1.BoostOutput` — flattened `BoostEvent { payload: oneof ... }`.
- `rewards.v1.RewardsOutput` — flattened `RewardsEvent { payload: oneof ... }`.
- `scarces.v1.ScarcesOutput` — flattened `ScarcesEvent` with operation routing.
- `token.v1.TokenOutput` — NEP-141 `TokenEvent`.
- `social_spend.v1.SocialSpendOutput` — social spend events.

The `*_db_out` modules turn those outputs into row changes. The node indexer and the neardata reader apply those rows in Postgres against the matching `*_schema.sql`.

## Architecture

```
NEAR block
   │
   ├─ node indexer (local node, cursor id indexer)
   └─ neardata reader (historical blocks, cursor id neardata_reader)
   │
   ▼  EVENT_JSON:{...} log lines (NEP-297 / NEP-141)
src/block_walker.rs ── filter by receiver_id ──► per-contract decoder
                                                │
                                                ▼
                            proto::*::Output (typed events)
                                                │
                                                ▼
                                  *_db_out → row changes
                                                │
                                                ▼
                                           PostgreSQL
                                                │
                                                ▼
                                      Hasura GraphQL API
```
