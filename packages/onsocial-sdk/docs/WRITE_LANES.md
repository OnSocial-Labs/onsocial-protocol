# Write lanes: session vs wallet

OnSocial has **two** write paths. Pick the lane that matches the call — mixing
them is the most common builder failure (`ReceiverMismatch`, `got 0` deposit).

| Lane | When | Client setup | Gas / NEAR |
| --- | --- | --- | --- |
| **Session (gateway)** | Social graph writes to `core` — posts, stand, profile, reactions, groups, … | `os.attachSession(session)`; leave `defaultBroadcast` unset | Relayer pays gas; attach at most **1 yocto** for confirmations |
| **Wallet** | Anything that targets **`scarces`**, or needs a **NEAR value** payment | `defaultBroadcast: { kind: 'wallet', signer }` (often a **second** client) | User pays gas; pass `depositYocto` for the full price |

Session FunctionCall keys are scoped to `core.onsocial.*`. They **cannot** call
`scarces.onsocial.*` and **cannot** attach listing-price deposits. The gateway
relayer only accepts **0** or **1** yocto on delegate submits.

## Social writes (session) — copy/paste

```ts
import { OnSocial } from '@onsocial/sdk';

const os = new OnSocial({ network: 'testnet', gatewayUrl });
os.attachSession(session); // from your onboarding / session grant flow

await os.posts.create({ text: 'Hello' });
await os.standings.add('bob.testnet');
```

## Paid Scarces (wallet + deposit) — copy/paste

Use a **wallet-broadcast** client (do not attach the core session on this
instance). Attach the listing price as `depositYocto`.

```ts
import { OnSocial, nearToYocto } from '@onsocial/sdk';

// Adapt to your wallet (near-connect, wallet-selector, …).
const signer = async ({ receiverId, actions }) => {
  const result = await wallet.signAndSendTransaction({
    receiverId,
    actions: actions.map((a) => ({
      type: 'FunctionCall',
      params: {
        methodName: a.methodName,
        args: a.args,
        gas: a.gas,
        deposit: a.deposit, // SDK sets this from depositYocto
      },
    })),
  });
  return { txHash: result.transaction.hash, raw: result };
};

const scarces = new OnSocial({
  network: 'testnet',
  gatewayUrl,
  actorId: accountId,
  defaultBroadcast: { kind: 'wallet', signer },
});

// Lazy listing (mint-on-purchase) — deposit must equal on-chain price.
const priceNear = '0.5';
await scarces.scarces.lazy.purchase(listingId, {
  depositYocto: nearToYocto(priceNear),
});

// Fixed-price secondary sale
await scarces.scarces.market.purchase(tokenId, {
  depositYocto: nearToYocto(priceNear),
});
```

Prefer reading the live price from the contract (`get_lazy_listing` /
sale view) before buy so UI and deposit stay in sync.

## Scarces that are not “pay NEAR”

| Call | Lane | Notes |
| --- | --- | --- |
| `lazy.create` / `fromPost.list` | Wallet (scarces receiver) | No price deposit; wallet signs to `scarces` |
| `lazy.cancel`, `market.delist`, … | Wallet | Often **1 yocto** confirmation |
| `lazy.purchase`, `market.purchase`, bids, offers | Wallet + `depositYocto` | Full payment in attached deposit |
| Prepaid scarces balance | Advanced | Contract can draw prepaid storage; still not a core session |

## Errors → fix

| On-chain / SDK error | Cause | Fix |
| --- | --- | --- |
| `ReceiverMismatch` (`scarces` vs `core`) | Core session used for scarces | Wallet-broadcast client; no core session on that client |
| `Insufficient deposit … got 0` | Wallet tx with deposit `0` | Pass `depositYocto` equal to price; do not rely on session/relayer |
| `Lazy listing not found` | Stale / cancelled `listingId` | Preflight `get_lazy_listing`; refresh UI |
| `NeedsWalletConfirmationError` / `value_deposit_required` | Value deposit on gateway/session path | Switch to wallet broadcast + `depositYocto` |

## Two clients in one app

Typical pattern:

1. **`os`** — session attached → feed, profile, stand, amplify (core).
2. **`scarcesOs`** — wallet `defaultBroadcast` only → list / buy / market.

Sharing one client that sometimes has a session and sometimes a wallet is how
apps accidentally relay scarces through the wrong key.
