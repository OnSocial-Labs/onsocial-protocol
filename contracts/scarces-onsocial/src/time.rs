use crate::NS_PER_MS;
use near_sdk::env;

pub(crate) fn now_ms() -> u64 {
    env::block_timestamp() / NS_PER_MS
}

pub(crate) fn ns_to_ms_ceil(ns: u64) -> u64 {
    ns.saturating_add(NS_PER_MS - 1) / NS_PER_MS
}
