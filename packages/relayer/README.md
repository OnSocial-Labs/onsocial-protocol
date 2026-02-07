# OnSocial Relayer

A minimal relayer for gasless transactions on NEAR. Forwards pre-signed requests to the OnSocial contract, which verifies signatures on-chain.

## Quick Start

```bash
# Run locally
cargo run --bin relayer

# Run with Docker
docker compose up relayer
```

## Configuration

Configure via `relayer.toml` or environment variables:

```toml
rpc_url = "https://rpc-testnet.onsocial.id"
contract_id = "core.onsocial.testnet"
keys_path = "./account_keys/relayer.onsocial.testnet.json"
bind_address = "0.0.0.0:3040"
gas_tgas = 100
```

Environment variables use `RELAYER_` prefix:
```bash
export RELAYER_RPC_URL=https://rpc-mainnet.onsocial.id
export RELAYER_CONTRACT_ID=core.onsocial.near
```

## API

### `GET /health`

Health check with metrics.

```json
{
  "status": "ok",
  "relayer_account": "relayer.onsocial.testnet",
  "contract_id": "core.onsocial.testnet",
  "uptime_secs": 3600,
  "requests": 1234
}
```

### `POST /execute`

Forward a signed request to the contract.

```bash
curl -X POST http://localhost:3040/execute \
  -H "Content-Type: application/json" \
  -d '{
    "target_account": "alice.near",
    "action": { "type": "set", "data": { "profile/name": "Alice" } },
    "auth": {
      "type": "signed_payload",
      "public_key": "ed25519:...",
      "nonce": "1",
      "expires_at_ms": "0",
      "signature": "base64..."
    }
  }'
```

Response:
```json
{
  "success": true,
  "result": null,
  "tx_hash": "ABC123..."
}
```

## Deployment

### Hetzner (Production)

The relayer runs as a Docker container on Hetzner via `docker compose`:

```bash
# From /opt/onsocial on the server
docker compose build relayer
docker compose up -d relayer
```

Secrets are managed via `.env.production` (RELAYER_KEYS_JSON, RELAYER_RPC_URL, etc.).

### Docker (Local)

```bash
docker compose up relayer -d
```

## Architecture

```
Client → Relayer → Contract
         (pays gas)  (verifies signature)
```

1. Client signs payload with their key
2. Relayer wraps in transaction and pays gas
3. Contract verifies signature on-chain (trustless)

## License
