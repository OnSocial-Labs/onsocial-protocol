//! Generated protobuf code
//!
//! Run `cargo build` to regenerate from proto files.

// Generated enum variants may share a prefix (e.g. FtMint, FtBurn).
#![allow(clippy::enum_variant_names)]

/// Core-onsocial contract events (proto package: core_onsocial.v1)
pub mod core_onsocial {
    pub mod v1 {
        include!(concat!(env!("OUT_DIR"), "/core_onsocial.v1.rs"));
    }
}

/// Boost contract events
pub mod boost {
    pub mod v1 {
        include!(concat!(env!("OUT_DIR"), "/boost.v1.rs"));
    }
}

/// Rewards contract events
pub mod rewards {
    pub mod v1 {
        include!(concat!(env!("OUT_DIR"), "/rewards.v1.rs"));
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

/// Combined output wrapping all contract types
pub mod combined {
    pub mod v1 {
        include!(concat!(env!("OUT_DIR"), "/combined.v1.rs"));
    }
}
