# @onsocial/rpc

NEAR JSON-RPC client with retry, failover, and circuit breaker. Zero runtime deps (native `fetch`).

Server order: private node (`NEAR_RPC_URL`), keyed FastNear (`FASTNEAR_API_KEY` as a bearer header), Lava, public FastNear, then `rpc.*.near.org`. A call stops at the first provider that answers. The browser path is public FastNear, then NEAR.org, and never receives either key.

## Install

Workspace package — depend on `@onsocial/rpc` from other packages.

## Quick start

```typescript
import { createNearRpc, resolveNearRpcUrl } from '@onsocial/rpc';

const rpc = createNearRpc({
  network: 'testnet',
  primaryUrl: resolveNearRpcUrl('testnet'),
});

const res = await rpc.call('query', {
  request_type: 'view_account',
  finality: 'final',
  account_id: 'alice.testnet',
});
```

## Scripts

```bash
pnpm --filter @onsocial/rpc build
pnpm --filter @onsocial/rpc check
```
