# onsocial-intents

NEAR Intents API client for multi-token payments and currency pricing oracle.

## Features

- **Multi-Token Payments**: Accept payments in NEAR, SOCIAL, USDC, USDT, and more
- **Currency Pricing Oracle**: Convert any currency to NEAR using NEAR Intents as implicit oracle
- **Cross-Chain Support**: Enable payments from multiple blockchains
- **Zero Oracle Fees**: No Chainlink/Pyth costs - NEAR Intents provides pricing via getQuote()
- **Type-Safe API**: Full TypeScript support with comprehensive interfaces
- **Swap Monitoring**: Real-time status tracking for payment processing

## Installation

```bash
pnpm add onsocial-intents
```

## Quick Start

### Basic Usage

```typescript
import { IntentsClient, PriceMode } from 'onsocial-intents';

// Initialize client
const client = new IntentsClient({
  jwtToken: process.env.NEAR_INTENTS_JWT, // Optional - eliminates 0.1% fee
});

// Get a quote for multi-token payment
const quote = await client.getQuote({
  originAsset: 'nep141:usdc.e.near',
  destinationAsset: 'near',
  amount: '100000000', // 100 USDC (6 decimals)
  recipient: 'marketplace.near',
  refundTo: 'user.near',
});

// User transfers tokens to quote.depositAddress
// Submit deposit to trigger faster processing
await client.submitDeposit(quote.depositAddress, userTxHash);

// Monitor swap status
const status = await client.getSwapStatus(quote.depositAddress);
```

### Currency PriceMode (Stable Pricing)

Perfect for NFT ticketing where you want stable USD/EUR pricing:

```typescript
import { convertToNear, PriceMode } from 'onsocial-intents';

// Define ticket price in USD
const ticketPrice: PriceMode = {
  type: 'Currency',
  amount: '5000000', // $50.00 (6 decimals)
  currency: 'USD',
};

// Convert to NEAR using NEAR Intents as oracle
const nearPrice = await convertToNear(ticketPrice);
console.log(`Current NEAR price: ${nearPrice} yoctoNEAR`);

// Display both prices to user
const usdDisplay = formatCurrency(ticketPrice.amount, 'USD'); // "$50.00"
const nearDisplay = formatNear(nearPrice); // "~8.5 NEAR"
```

### Pricing Oracle

Use NEAR Intents as a pricing oracle for any currency:

```typescript
import { getPrice } from 'onsocial-intents';

// Get current price of any token in NEAR
const socialPriceInNear = await getPrice({
  fromCurrency: 'SOCIAL',
  toCurrency: 'NEAR',
  amount: '1000000000000000000000000', // 1 SOCIAL (24 decimals)
});

// Get NEAR price in USD
const nearPriceInUsd = await getPrice({
  fromCurrency: 'NEAR',
  toCurrency: 'USD',
  amount: '1000000000000000000000000', // 1 NEAR (24 decimals)
});
```

## API Reference

### IntentsClient

Main client for interacting with NEAR Intents 1Click API.

```typescript
class IntentsClient {
  constructor(config?: ClientConfig);
  
  getQuote(request: QuoteRequest): Promise<QuoteResponse>;
  submitDeposit(depositAddress: string, txHash: string): Promise<{ success: boolean }>;
  getSwapStatus(depositAddress: string): Promise<StatusResponse>;
  pollSwapStatus(
    depositAddress: string,
    onUpdate?: (status: StatusResponse) => void,
    maxAttempts?: number,
    intervalMs?: number
  ): Promise<StatusResponse>;
}
```

### PriceMode

Type-safe price representation supporting both stable currency and NEAR pricing:

```typescript
type PriceMode = 
  | { type: 'Currency'; amount: string; currency: string }
  | { type: 'NEAR'; priceNear: string };
```

### Pricing Functions

```typescript
// Convert currency price to NEAR using NEAR Intents as oracle
function convertToNear(
  price: PriceMode,
  options?: ConversionOptions
): Promise<string>;

// Get exchange rate between any two currencies
function getPrice(params: PriceRequest): Promise<string>;

// Format prices for display
function formatCurrency(amount: string, currency: string, decimals?: number): string;
function formatNear(yoctoNear: string): string;
```

## Supported Tokens

### Native NEAR Tokens ✨ (Recommended)

- **NEAR**: Native NEAR Protocol token
- **SOCIAL**: `social.tkn.near` - OnSocial community token
- **USDC (Native)**: `17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1`
  - Direct issuance from Circle on NEAR
  - Better liquidity than bridged versions
  - No bridge risk or delays
  - **Use this instead of `usdc.e.near` (bridged)**
- **USDT (Native)**: `usdt.tether-token.near`
  - Official Tether on NEAR
  - Direct issuance from Tether
  - **Use this instead of `usdt.e.near` (bridged)**

### Bridged Tokens

- **DAI**: `6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near`

### Cross-Chain Support

NEAR Intents supports 100+ tokens across 15+ blockchains including:
- **Ethereum**: USDC, USDT, DAI, WETH
- **Arbitrum**: USDC, USDT, ARB
- **Base**: USDC, cbETH
- **Solana**: USDC, USDT, SOL
- **Polygon**: USDC, USDT, MATIC
- **BSC**: USDC, USDT, BNB
- **Avalanche**: USDC, USDT, AVAX
- **Optimism**: USDC, USDT, OP
- **And more**: TON, Tron, Aptos, Sui, Gnosis, Stellar

Query live supported tokens: `GET https://1click.chaindefuser.com/v0/tokens`

## Configuration

### JWT Token (Recommended)

Eliminate the 0.1% protocol fee by obtaining a free JWT token:

1. Fill out form: https://docs.google.com/forms/d/e/1FAIpQLSdrSrqSkKOMb_a8XhwF0f7N5xZ0Y5CYgyzxiAuoC2g4a2N68g/viewform
2. Set environment variable:

```bash
NEAR_INTENTS_JWT=your_jwt_token_here
```

### Network Configuration

```typescript
const client = new IntentsClient({
  baseUrl: 'https://1click.chaindefuser.com', // Default
  jwtToken: process.env.NEAR_INTENTS_JWT,
  defaultSlippage: 100, // 1% slippage tolerance
  defaultDeadline: 3600000, // 1 hour in milliseconds
});
```

## Architecture

This package enables a clean separation of concerns:

- **Frontend**: Display prices, handle UI
- **onsocial-intents**: Convert currencies to NEAR (pricing oracle)
- **Smart Contract**: Validate NEAR deposits only

No on-chain oracles needed - NEAR Intents provides real-time pricing via `getQuote()` API!

## Examples

### NFT Marketplace with Stable Pricing

```typescript
// List NFT ticket with stable $50 price
const listing = {
  nftId: 'ticket-123',
  price: {
    type: 'Currency',
    amount: '50000000', // $50.00 (6 decimals)
    currency: 'USD',
  } as PriceMode,
};

// When user wants to buy
const nearPrice = await convertToNear(listing.price);

// User can pay with NEAR directly
await marketplace.purchase(nftId, { attachedDeposit: nearPrice });

// OR user can pay with any token via NEAR Intents
const quote = await client.getQuote({
  originAsset: 'nep141:usdc.e.near',
  destinationAsset: 'near',
  amount: listing.price.amount, // $50 USDC
  recipient: 'marketplace.near',
  refundTo: userAccountId,
});
// User sends USDC to quote.depositAddress
// Solvers convert to NEAR and call marketplace.purchase()
```

### Backend Price Monitoring

```typescript
import { convertToNear, PriceMode } from 'onsocial-intents';

// Update NEAR prices every 30 seconds for Currency-mode listings
setInterval(async () => {
  const listings = await db.getActiveCurrencyListings();
  
  for (const listing of listings) {
    const currentNearPrice = await convertToNear(listing.price);
    await db.updateListingPrice(listing.id, currentNearPrice);
  }
}, 30000);
```

## Testing

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch
```

## Links

- [NEAR Intents Documentation](https://docs.near-intents.org/)
- [1Click API Reference](https://docs.near-intents.org/near-intents/integration/distribution-channels/1click-api)
- [OnSocial Protocol](https://github.com/OnSocial-Labs/onsocial-protocol)

## License

MIT © OnSocial Labs
