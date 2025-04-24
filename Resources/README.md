# Resources

- **Deployment Guide**: See `deployment-guide.md` for detailed Docker-only deployment instructions.
- **Contract Details**:
  - `auth-onsocial`: Public key authentication with multi-signature support. Depends on `near-sdk`.
  - `ft-wrapper-onsocial`: Fungible token transfers and cross-chain bridging. Depends on `auth-onsocial` for manager account and `relayer-onsocial` for transaction relaying.
  - `relayer-onsocial`: Gasless meta-transactions and account sponsoring. Depends on `auth-onsocial` for authentication and `ft-wrapper-onsocial` for token operations.
  - `new-contract1`, `new-contract2`, `new-contract3`: Placeholder contracts for custom functionality. No external dependencies yet.
- **Contract Dependencies and Usage**:
  - Contracts are built using Rust and `near-sdk` (5.12.0). Dependencies are defined in each contract's `Cargo.toml` and inherited from the workspace `Cargo.toml`.
  - Use `auth-onsocial` for secure key registration and multi-signature transactions.
  - Use `ft-wrapper-onsocial` for managing fungible tokens, integrated with cross-chain protocols.
  - Use `relayer-onsocial` for gasless transactions, leveraging `auth-onsocial` for authentication and `ft-wrapper-onsocial` for token transfers.
  - Placeholder contracts (`new-contract1`, etc.) can be extended for custom logic; update `configs/contracts.json` and `Cargo.toml` accordingly.