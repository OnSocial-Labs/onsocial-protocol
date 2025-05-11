# Resources

- **Deployment Guide:** See [`deployment-guide.md`](deployment-guide.md) for step-by-step Docker-based deployment instructions.

## Contract Details

| Contract            | Purpose                               | Main Entrypoints (Methods)                                                 |
| ------------------- | ------------------------------------- | -------------------------------------------------------------------------- |
| auth-onsocial       | User authentication, multisig         | register_key, remove_key, is_key_registered, add_guardian, remove_guardian |
| ft-wrapper-onsocial | Token transfer, cross-chain bridging  | transfer, deposit, withdraw, get_balance, bridge                           |
| relayer-onsocial    | Gasless meta-transactions, sponsoring | relay, sponsor, get_nonce, set_relayer, remove_relayer                     |

- All contracts are written in Rust using [`near-sdk`](https://docs.rs/near-sdk) and managed as a Cargo workspace.
- Each contract has its own `Cargo.toml` for dependencies; shared dependencies are managed in the root `Cargo.toml`.
- Contracts interact via cross-contract calls and are deployed to subaccounts (see deployment guide).

For contract source code, see the `contracts/` directory. For integration tests, see `tests/src/`.
