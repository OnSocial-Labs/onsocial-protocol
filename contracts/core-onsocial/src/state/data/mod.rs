// Data domain: read/write operations for user and group data

mod get;

// Write path (SetRequest + auth flows, intents, delegation)
mod set;
mod delegate_action;
mod direct;
mod helpers;
mod intent;
mod nonce;
mod signed_payload;

// Low-level data operation processing
mod data_ops;
