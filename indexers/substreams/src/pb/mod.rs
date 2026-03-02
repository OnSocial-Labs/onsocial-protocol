//! Generated protobuf code
//!
//! Run `cargo build` to regenerate from proto files.

// Generated enum variants may share a prefix (e.g. FtMint, FtBurn).
#![allow(clippy::enum_variant_names)]

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

/// Scarces (NFT marketplace) contract events
pub mod scarces {
    pub mod v1 {
        include!(concat!(env!("OUT_DIR"), "/scarces.v1.rs"));
    }
}
