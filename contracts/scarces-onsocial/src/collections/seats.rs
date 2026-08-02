//! Seat allocation for collection mints.
//!
//! Sequential collections hand out `minted_count..` in order. Random-assignment
//! collections draw uniformly from the unminted pool so rare variations cannot
//! be sniped by timing a purchase. NEAR's async model makes the draw safe from
//! retry-gaming: a caller cannot revert a completed mint after seeing which
//! seat it received.
//!
//! The pool is a sparse Fisher–Yates swap map stored outside the contract
//! struct (same pattern as `sale_created_at_store`), so no state migration is
//! needed. Positions `0..remaining` are the live pool; a missing key means the
//! position still holds its own index. Each draw removes at least as many
//! entries as it inserts, and the map is empty again once a collection mints
//! out.

use crate::*;
use near_sdk::store::LookupMap;

/// Reverse log of pool mutations for one allocation: `(key, value before)`.
/// Applied in reverse by [`Contract::restore_seat_pool`] when a mint batch is
/// rolled back after payment/storage failures.
pub(crate) type SeatPoolJournal = Vec<(String, Option<u32>)>;

impl Contract {
    fn seat_pool_store() -> LookupMap<String, u32> {
        LookupMap::new(StorageKey::CollectionSeatPool)
    }

    fn seat_pool_key(collection_id: &str, position: u32) -> String {
        format!("{collection_id}:{position}")
    }

    /// Uniform draw in `0..remaining`, derived from the receipt's VRF seed,
    /// the collection, and the global mint position (so every draw in a batch
    /// uses distinct entropy). Modulo bias is negligible: 2^64 >> 100k seats.
    fn random_seat_position(
        seed: &[u8],
        collection_id: &str,
        global_position: u32,
        remaining: u32,
    ) -> u32 {
        let mut input = Vec::with_capacity(seed.len() + collection_id.len() + 4);
        input.extend_from_slice(seed);
        input.extend_from_slice(collection_id.as_bytes());
        input.extend_from_slice(&global_position.to_le_bytes());
        let hash = env::sha256(&input);
        let mut bytes = [0u8; 8];
        bytes.copy_from_slice(&hash[..8]);
        (u64::from_le_bytes(bytes) % remaining as u64) as u32
    }

    /// Allocate `quantity` seat indices (0-based) for the next mint batch.
    /// Callers must have verified `quantity <= total_supply - minted_count`.
    pub(crate) fn allocate_seat_indices(
        &mut self,
        collection: &LazyCollection,
        quantity: u32,
    ) -> (Vec<u32>, SeatPoolJournal) {
        let start = collection.minted_count;
        if !collection.random_assignment {
            return ((start..start + quantity).collect(), Vec::new());
        }

        let mut pool = Self::seat_pool_store();
        let mut journal: SeatPoolJournal = Vec::new();
        let mut seats = Vec::with_capacity(quantity as usize);
        let seed = env::random_seed();

        for i in 0..quantity {
            let remaining = collection.total_supply - start - i;
            let draw =
                Self::random_seat_position(&seed, &collection.collection_id, start + i, remaining);
            let last = remaining - 1;

            let draw_key = Self::seat_pool_key(&collection.collection_id, draw);
            let prev_draw = pool.remove(&draw_key);
            let seat = prev_draw.unwrap_or(draw);
            journal.push((draw_key.clone(), prev_draw));

            // Keep positions 0..remaining-1 dense: move the last position's
            // value into the drawn slot, then let `last` fall out of range.
            if draw != last {
                let last_key = Self::seat_pool_key(&collection.collection_id, last);
                let prev_last = pool.remove(&last_key);
                let moved = prev_last.unwrap_or(last);
                journal.push((last_key, prev_last));
                pool.insert(draw_key, moved);
            }

            seats.push(seat);
        }

        // Flush pool writes so callers' storage measurements see them.
        drop(pool);
        (seats, journal)
    }

    /// Undo an allocation's pool mutations (reverse order restores exactly).
    pub(crate) fn restore_seat_pool(journal: SeatPoolJournal) {
        if journal.is_empty() {
            return;
        }
        let mut pool = Self::seat_pool_store();
        for (key, prev) in journal.into_iter().rev() {
            match prev {
                Some(value) => {
                    pool.insert(key, value);
                }
                None => {
                    pool.remove(&key);
                }
            }
        }
    }
}
