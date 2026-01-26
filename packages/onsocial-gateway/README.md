# OnSocial Gateway

Unified API gateway for OnSocial services with token-gated access tiers.

## Features

- **Unified API**: Single endpoint for graph, storage, and relay services
- **Token-Gated Access**: Rate limits based on SOCIAL token holdings
- **JWT Authentication**: NEAR wallet signature → JWT token
- **Tier-Based Rate Limiting**: Free, Staker, and Builder tiers

## Quick Start

```bash
# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env
# Edit .env with your values

# Start development server
pnpm dev
```

## API Endpoints

### Auth

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth/login` | POST | Authenticate with NEAR signature |
| `/auth/refresh` | POST | Refresh JWT token |
| `/auth/me` | GET | Get current user info |
| `/auth/tier/:accountId` | GET | Get tier for any account |

### Graph (Hasura Proxy)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/graph/query` | POST | GraphQL query |
| `/graph/health` | GET | Hasura health check |

### Storage (Lighthouse/IPFS)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/storage/upload` | POST | Upload file to IPFS |
| `/storage/upload-json` | POST | Upload JSON to IPFS |
| `/storage/:cid` | GET | Get file by CID |

### Relay

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/relay/submit` | POST | Submit signed transaction |
| `/relay/meta-tx` | POST | Submit meta-transaction (Staker+) |
| `/relay/status/:txHash` | GET | Get transaction status |
| `/relay/health` | GET | Relay health check |

## Tiers

| Tier | Rate Limit | Requirements |
|------|------------|--------------|
| Free | 60/min | None |
| Staker | 600/min | Hold SOCIAL tokens |
| Builder | 6000/min | Hold more SOCIAL tokens |

## Authentication Flow

1. Client signs message: `"OnSocial Auth: <timestamp>"`
2. POST to `/auth/login` with signature
3. Receive JWT token with embedded tier
4. Include `Authorization: Bearer <token>` in requests
5. Refresh token before expiry via `/auth/refresh`

## Environment Variables

See `.env.example` for all options.

### CI/CD Secrets Required

The GitHub Actions workflow requires these secrets:
- `LIGHTHOUSE_API_KEY`: Lighthouse storage API key
- `HASURA_ADMIN_SECRET`: Hasura admin secret for GraphQL access

## Development

```bash
# Run with hot reload
pnpm dev

# Type check
pnpm build

# Run tests
pnpm test
```

## License

MIT
