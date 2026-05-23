# Resources

This directory contains additional guides and resources for working with the OnSocial Protocol.

## Available Resources

- **[Deployment Guide](deployment-guide.md):** Step-by-step instructions for deploying contracts using Docker.

## Notifications Testnet Promotion

Use testnet as the complete rehearsal environment for managed notifications before promoting the same flow to mainnet.

Testnet requirements:

- `notification-worker` is running and healthy.
- Gateway receives `ADMIN_WALLETS` from Secret Manager so configured test accounts resolve to `service` tier.
- `ONSOCIAL_SERVICE_ONAPI_KEY` belongs to an account listed in `ADMIN_WALLETS`.
- Gateway migrations have created notification tables and cursors.
- Worker source tables exist or are intentionally skipped until the relevant indexer source is deployed: `data_updates`, `group_updates`, `rewards_events`, `boost_events`, `scarces_events`, `app_notification_events`.
- Custom dapps emit explicit notification intent through `os.notifications.sendEvents()` instead of relying on automatic schema inference.

The suite proves:

- `os.notifications.sendEvents()` queues custom app events.
- The worker fans out `app_notification_events` into `notifications`.
- SDK list/count/read-state APIs observe the notification.
- Notification rules can be created, listed, and deleted.
- Event dedupe keys prevent duplicate notifications.
- A protocol reply indexed from `data_updates` fans out through a developer rule.
- User-facing boost events map from `boost_events` into boost notification types.
- Custom app events can carry source contract, receipt, block-height, object, group, and context metadata.

Run the live SDK notification suite on testnet:

```sh
ONSOCIAL_NETWORK=testnet pnpm --filter @onsocial/sdk exec vitest run tests/integration/notifications.integration.test.ts --fileParallelism=false --reporter=verbose
```

After mainnet contracts, gateway migrations, indexer source tables, and worker deployment are ready, run the same suite with mainnet credentials:

```sh
ONSOCIAL_NETWORK=mainnet \
ACCOUNT_ID=<mainnet-test-account> \
ONSOCIAL_MAINNET_API_KEY=<service-or-paid-mainnet-key> \
pnpm --filter @onsocial/sdk exec vitest run tests/integration/notifications.integration.test.ts --fileParallelism=false --reporter=verbose
```

Mainnet is ready for notification promotion when the same test path passes without code changes and source-table coverage matches the deployed contracts.

## AI Prompts

Guides for AI-assisted development:

- **General Project**: [project.md](prompts/project.md)
- **Contracts**:
  - [auth-onsocial](prompts/contracts/auth-onsocial.md)
  - [scarces-onsocial](prompts/contracts/scarces-onsocial.md)
  - [core-onsocial](prompts/contracts/core-onsocial.md)
  - [staking-onsocial](prompts/contracts/staking-onsocial.md)
- [App](prompts/app.md)
- [SDK](prompts/sdk.md)
- [Relayer](prompts/relayer.md)
- [Tests](prompts/tests.md)
- [Docs](prompts/docs.md)

## Purpose

The `Resources/` folder is designed to provide supplementary documentation and tools to support development, deployment, and testing of the OnSocial Protocol.

For contract-specific details, refer to the individual `README.md` files in the `contracts/` directory or the [Documentation Index](../README.md#documentation-index) in the root `README.md`.
