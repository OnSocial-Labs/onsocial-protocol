# onsocial-js

**Expo-safe NEAR transaction utilities for OnSocial frontend integration.**

## Features
- Build and serialize NEAR transactions in Expo/React Native (no Node.js polyfills)
- Uses only modular, browser-compatible @near-js packages
- Utilities for base58/base64 encoding, borsh serialization, and more

## Usage
```ts
import { buildTransaction, serializeTransaction, encodeBase58, decodeBase58 } from 'onsocial-js';

const tx = buildTransaction({ ... });
const serialized = serializeTransaction(tx);
```

## Expo/React Native Caveats
- Do **not** use `near-api-js` monolith or any Node.js-only package.
- This package is designed for browser/Expo environments only.

## Development
- `pnpm install`
- `pnpm build`

## License
MIT
