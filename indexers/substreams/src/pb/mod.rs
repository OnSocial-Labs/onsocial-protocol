//! Generated protobuf code
//!
//! Run `cargo build` to regenerate from proto files.

/// Core-onsocial contract events (proto package: core_onsocial.v1)
pub mod core {
    pub mod v1 {
        include!(concat!(env!("OUT_DIR"), "/core_onsocial.v1.rs"));
    }
}

/// Staking contract events
pub mod staking {
    pub mod v1 {
        include!(concat!(env!("OUT_DIR"), "/staking.v1.rs"));
    }
}

/// Token (NEP-141) contract events
pub mod token {
    pub mod v1 {
        include!(concat!(env!("OUT_DIR"), "/token.v1.rs"));
    }
}
