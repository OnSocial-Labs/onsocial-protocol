# @onsocial/rpc

NEAR JSON-RPC client with retry, failover, and circuit breaker. Zero runtime deps (native `fetch`). Callers inject a Lava API key when using Lava endpoints.

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
