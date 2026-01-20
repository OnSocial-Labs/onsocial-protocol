use crate::constants::NUM_PARTITIONS;
use xxhash_rust::xxh3;

#[inline(always)]
pub(crate) fn fast_hash(data: &[u8]) -> u128 {
    xxh3::xxh3_128(data)
}

#[inline(always)]
pub fn get_partition(namespace_id: &str) -> u16 {
    let hash = fast_hash(namespace_id.as_bytes());
    (hash % NUM_PARTITIONS as u128) as u16
}

#[inline(always)]
pub fn make_key(namespace: &str, namespace_id: &str, relative_path: &str) -> String {
    if namespace == "groups" {
        format!("groups/{}/{}", namespace_id, relative_path)
    } else {
        format!("{}/{}", namespace_id, relative_path)
    }
}
