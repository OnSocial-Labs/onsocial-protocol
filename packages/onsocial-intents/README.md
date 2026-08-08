# onsocial-intents

Typed client for the [NEAR Intents 1Click API](https://docs.near-intents.org/near-intents/integration/distribution-channels/1click-api) — quotes, deposits, and swap status. Token discovery is dynamic (`GET /v0/tokens`), not a hardcoded list.

## Install

```bash
pnpm add onsocial-intents
```

## Quick start

```typescript
import { IntentsClient } from 'onsocial-intents';

const client = new IntentsClient({
  jwtToken: process.env.NEAR_INTENTS_JWT, // optional — reduces protocol fee
});

const { quote } = await client.getQuote({
  dry: false,
  swapType: 'EXACT_INPUT',
  slippageTolerance: 100,
  originAsset: 'nep141:usdc.near', // use live ids from getTokens()
  depositType: 'ORIGIN_CHAIN',
  destinationAsset: 'near',
  amount: '100000000',
  refundTo: 'alice.near',
  recipient: 'alice.near',
  recipientType: 'DESTINATION_CHAIN',
  deadline: client.createDeadline(),
});

await client.submitDeposit({
  depositAddress: quote.depositAddress!,
  txHash: userTxHash,
  nearSenderAccount: 'alice.near',
});

const status = await client.getStatus(quote.depositAddress!);
```

## API

```typescript
class IntentsClient {
  getTokens(): Promise<Token[]>;
  getQuote(request: QuoteRequest): Promise<QuoteResponse>;
  submitDeposit(request: SubmitDepositRequest): Promise<SubmitDepositResponse>;
  getStatus(depositAddress: string, depositMemo?: string): Promise<StatusResponse>;
  pollStatus(/* … */): Promise<StatusResponse>;
  getAnyInputWithdrawals(/* … */): Promise<AnyInputWithdrawalsResponse>;
  createDeadline(offsetMs?: number): string;
}
```

Also exported: `TokenRegistry` / `createRegistry`, amount/asset helpers (`parseAmount`, `formatAmount`, `formatAssetId`, …).

## Config

```typescript
new IntentsClient({
  baseUrl: 'https://1click.chaindefuser.com',
  jwtToken: process.env.NEAR_INTENTS_JWT,
  defaultSlippage: 100, // 1%
  defaultDeadline: 3_600_000,
});
```

JWT signup: [NEAR Intents form](https://docs.google.com/forms/d/e/1FAIpQLSdrSrqSkKOMb_a8XhwF0f7N5xZ0Y5CYgyzxiAuoC2g4a2N68g/viewform).

## Scripts

```bash
pnpm --filter onsocial-intents test
pnpm --filter onsocial-intents build
```

## Links

- [NEAR Intents docs](https://docs.near-intents.org/)
- [OnSocial Protocol](https://github.com/OnSocial-Labs/onsocial-protocol)
