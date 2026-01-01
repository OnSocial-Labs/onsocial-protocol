# OnSocial Substreams Indexer

Substreams module for indexing OnSocial NEAR contract events.

## Overview

This indexer decodes Borsh-serialized events from the `core-onsocial` NEAR contract.
Events are emitted with the format `EVENT:<base64-encoded-borsh-data>`.

## Prerequisites

1. Install Substreams CLI:
   ```bash
   # Linux
   curl -L https://github.com/streamingfast/substreams/releases/latest/download/substreams_linux_x86_64.tar.gz | tar xz
   sudo mv substreams /usr/local/bin/

   # macOS
   brew install streamingfast/tap/substreams
   ```

2. Authenticate (free account):
   ```bash
   substreams auth
   ```

3. Install Rust wasm target:
   ```bash
   rustup target add wasm32-unknown-unknown
   ```

## Build

```bash
# Generate protobuf code and build WASM module
cargo build --release --target wasm32-unknown-unknown
```

## Test Locally (without deployment)

### Run against NEAR Testnet
```bash
substreams run substreams.yaml map_onsocial_events \
  -e testnet.near.streamingfast.io:443 \
  --start-block 170000000 \
  --stop-block +100
```

### Run against NEAR Mainnet
```bash
substreams run substreams.yaml map_onsocial_events \
  -e mainnet.near.streamingfast.io:443 \
  --start-block 130000000 \
  --stop-block +100 \
  -p map_onsocial_events="contract_id=onsocial.near"
```

### Interactive GUI
```bash
substreams gui substreams.yaml map_onsocial_events \
  -e mainnet.near.streamingfast.io:443 \
  --start-block 130000000
```

## Configuration

The module accepts a parameter to filter by contract:

```yaml
params:
  map_onsocial_events: "contract_id=onsocial.near"
```

## Output Schema

Events are decoded into this structure:

```protobuf
message Event {
  string evt_standard = 1;  // "onsocial"
  string version = 2;       // "1.0.0"
  string evt_type = 3;      // "user", "post", etc.
  string op_type = 4;       // "set", "delete"
  EventData data = 5;
}

message EventData {
  uint64 block_height = 1;
  uint64 timestamp = 2;
  string author = 3;
  uint32 partition_id = 4;
  repeated ExtraField extra = 5;
  string evt_id = 6;
  uint32 log_index = 7;
}
```

## Sinks

After decoding events, pipe them to:

### PostgreSQL
```bash
substreams-sink-sql run \
  "postgres://user:pass@localhost:5432/onsocial" \
  substreams.yaml
```

### Files (Parquet/JSON)
```bash
substreams-sink-files run \
  substreams.yaml \
  --output-path ./data \
  --file-type parquet
```

## Architecture

```
NEAR Block
    ↓
Substreams (map_onsocial_events)
    ↓ Decode EVENT:base64(borsh) logs
Events protobuf
    ↓
SQL Sink → PostgreSQL
    ↓
Your Backend API
    ↓
Frontend App
```

## Development

Run decoder tests:
```bash
cargo test
```

Verify protobuf schema:
```bash
substreams info substreams.yaml
```
