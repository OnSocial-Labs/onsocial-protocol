# Makefile Documentation

The `Makefile` in this monorepo simplifies common tasks for building, testing, deploying, and managing the OnSocial Protocol. Below is a categorized list of all available commands.

## Build Commands
- `make build` — Build all Rust contracts.
- `make build-js` — Build all JavaScript packages.
- `make build-app-js` — Build the Expo app.
- `make build-relayer-js` — Build the relayer package.
- `make build-reproducible-rs` — Build reproducible WASM for mainnet.

## Test Commands
- `make test-rs` — Run all unit and integration tests for Rust contracts.
- `make test-js` — Run tests for all JavaScript packages.
- `make test-app-js` — Run tests for the Expo app.
- `make test-relayer-js` — Run tests for the relayer package.
- `make test-all-contracts` — Run all tests for all contracts.
- `make test-unit-rs` — Run unit tests for all or specific Rust contracts.
- `make test-integration-rs` — Run integration tests for all or specific Rust contracts.

## Deployment Commands
- `make deploy-rs` — Deploy a Rust contract (CONTRACT= required).
- `make deploy-init-rs` — Initialize a deployed Rust contract.
- `make deploy-reproducible-rs` — Deploy with reproducible WASM.
- `make deploy-dry-run-rs` — Simulate deployment of a Rust contract.

## Formatting and Linting
- `make format-rs` — Format all Rust contracts.
- `make lint-rs` — Lint all Rust contracts.
- `make format-js` — Format all JavaScript packages.
- `make lint-js` — Lint all JavaScript packages.

## Sandbox Management
- `make init-sandbox` — Initialize NEAR Sandbox.
- `make start-sandbox` — Start NEAR Sandbox.
- `make stop-sandbox` — Stop NEAR Sandbox.
- `make clean-sandbox` — Clean NEAR Sandbox data.
- `make logs-sandbox` — Display NEAR Sandbox logs.

## Utility Commands
- `make abi-rs` — Generate ABIs for all Rust contracts.
- `make inspect-state-rs` — Inspect contract state.
- `make patch-state-rs` — Patch sandbox state.
- `make upgrade-deps-rs` — Upgrade Rust dependencies interactively.
- `make upgrade-deps-js` — Upgrade JavaScript dependencies interactively.
- `make cargo-update-rs` — Update Cargo dependencies.
- `make clean-all-rs` — Clean all Rust artifacts and sandbox data.

## JavaScript-Specific Commands
- `make start-app-js` — Start the Expo app.
- `make start-relayer-js` — Start the relayer server.
- `make build-onsocial-js` — Build the `onsocial-js` package.
- `make test-onsocial-js` — Run tests for the `onsocial-js` package.
- `make lint-onsocial-js` — Lint the `onsocial-js` package.
- `make format-onsocial-js` — Format the `onsocial-js` package.

## Help
Run `make help` to see a full list of commands and their descriptions.