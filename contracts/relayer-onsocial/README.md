# OnSocial Relayer

The OnSocial Relayer is a Rust-based smart contract on the NEAR Protocol designed to facilitate gasless transactions for a social media application. It enables users to perform actions like posting, tipping, staking, and cross-chain bridging without paying gas fees by relaying meta-transactions and sponsoring accounts. The relayer integrates with authentication, fungible token, and multi-party computation (MPC) contracts to provide secure and scalable functionality.

## Features

- **Gasless Transactions**: Relays meta-transactions to cover gas costs for users.
- **Account Sponsoring**: Creates and funds new accounts with customizable multi-signature settings.
- **Key Management**: Registers and removes public keys for transaction authorization.
- **Cross-Chain Bridging**: Supports token transfers to other blockchains using MPC signatures.
- **Admin Controls**: Allows configuration of gas limits, fees, balance thresholds, and contract addresses.
- **Event Logging**: Emits detailed events for actions like key registration, bridging, and configuration changes.
- **Pause/Unpause**: Enables admins to temporarily halt operations for maintenance or upgrades.
- **Migration Support**: Facilitates state upgrades for future enhancements.

## Prerequisites

- **Rust**: Required for compiling the contract (`rustc` and `cargo`).
- **cargo-near**: NEAR-specific build tool for smart contracts.
- **NEAR CLI**: For deploying and interacting with the contract.
- **NEAR Account**: Needed for deployment and testing on testnet/mainnet.

## License

This project is licensed under the MIT License. See the LICENSE file for details.




