# OnSocial Relayer

A NEP-366 relayer for gasless transactions on NEAR. It accepts pre-signed
`SignedDelegateAction` payloads, validates the inner call shape, and pays gas
for the outer `Action::Delegate(...)` transaction.

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
allowed_contracts = [
  "core.onsocial.testnet",
  "scarces.onsocial.testnet",
  "rewards.onsocial.testnet",
]
keys_path = "./account_keys/relayer.onsocial.testnet.json"
bind_address = "0.0.0.0:3040"
gas_tgas = 100
```

Environment variables use `RELAYER_` prefix:
```bash
export LAVA_API_KEY=your-lava-key
export RELAYER_ALLOWED_CONTRACTS=core.onsocial.near,scarces.onsocial.near,rewards.onsocial.near
```

`RELAYER_ALLOWED_CONTRACTS` is the canonical inner receiver allowlist. Every
relayed `SignedDelegateAction` must set `delegate_action.receiver_id` to one of
these contracts.

RPC resolution order:

1. `RELAYER_RPC_URL`
2. keyed Lava URL built from `LAVA_API_KEY`
3. FastNEAR default for the active network

Optional fallback override:

```bash
export RELAYER_FALLBACK_RPC_URL=https://free.rpc.fastnear.com
```

## API

### `GET /health`

Health check with metrics.

```json
{
  "status": "ok",
  "relayer_account": "relayer.onsocial.testnet",
  "allowed_contracts": [
    "core.onsocial.testnet",
    "scarces.onsocial.testnet",
    "rewards.onsocial.testnet"
  ],
  "uptime_secs": 3600,
  "requests": 1234
}
```

### `POST /execute_delegate`

Relay a NEP-366 `SignedDelegateAction` (gasless meta-transaction). The user's
session key signs the inner `FunctionCall`; the relayer signs and broadcasts
the outer `Action::Delegate(...)`.

The outer delegate transaction is signed with the relayer FullAccess delegate
signer pool, with each signer lane keeping its own nonce sequence.

For multi-instance KMS deployments, each relayer instance must have a stable
`RELAYER_INSTANCE_NAME` (`relayer-0`, `relayer-1`, etc.). The relayer derives
per-instance KMS delegate keys from that name, keeping nonce lanes separate
while both hosts serve the same `/execute_delegate` endpoint.

Production default is 50 FullAccess delegate signer lanes per instance:

```bash
export RELAYER_DELEGATE_POOL_SIZE=50
```

The relayer self-heals the pool at startup by creating or reusing KMS keys named
`delegate-{RELAYER_INSTANCE_NAME}-key-{i}` and registering their public keys
on-chain as FullAccess keys. To pre-create the KMS keys before deployment, run:

```bash
scripts/ensure_delegate_kms_keys.sh --network mainnet --pool-size 50
```

For additional instances, pass an explicit instance/keyring list:

```bash
scripts/ensure_delegate_kms_keys.sh \
  --network mainnet \
  --pool-size 50 \
  --instances relayer-0:relayer-keys-mainnet,relayer-1:relayer-keys-mainnet-1,relayer-2:relayer-keys-mainnet-2
```

```bash
curl -X POST 'http://localhost:3040/execute_delegate?wait=true' \
  -H "Content-Type: application/json" \
  -d '{ "signed_delegate": "<base64 borsh SignedDelegateAction>" }'
```

Response:
```json
{
  "success": true,
  "result": null,
  "tx_hash": "ABC123..."
}
```

### `POST /execute_rewards`

Private service endpoint for Telegram/backend rewards actions. It is protected
by the same `RELAYER_API_KEY` middleware as `/execute_delegate`, but it does not
accept arbitrary contract calls or user-signed delegates. The relayer always
submits a direct zero-deposit `execute` FunctionCall to
`RELAYER_REWARDS_CONTRACT_ID` using the FullAccess KMS lane pool.

```bash
curl -X POST 'http://localhost:3040/execute_rewards?wait=true' \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: $RELAYER_API_KEY" \
  -d '{ "action": { "type": "claim", "account_id": "alice.testnet" } }'
```

`RELAYER_REWARDS_CONTRACT_ID` defaults to `rewards.onsocial.near` on mainnet
and `rewards.onsocial.testnet` on testnet. It must also be present in
`RELAYER_ALLOWED_CONTRACTS`.

## Deployment

### Hetzner (Production)

The relayer runs as a Docker container on Hetzner via `docker compose`:

```bash
# From /opt/onsocial on the server
docker compose build relayer
docker compose up -d relayer
```

Secrets are managed via `.env.production` (`RELAYER_KEYS_JSON`, `LAVA_API_KEY`, optional `RELAYER_RPC_URL`, etc.).

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
