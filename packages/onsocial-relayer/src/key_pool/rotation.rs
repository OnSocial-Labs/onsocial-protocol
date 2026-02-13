//! Autoscaler loop, key rotation, and slot lifecycle management.

use super::slot::{now_secs, ACTIVE, DEAD, DRAINING, WARMUP};
use super::KeyPool;
use crate::rpc::RpcClient;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;
use tracing::{error, info, warn};

impl KeyPool {
    /// Run the autoscaler loop. Returns when `cancel` is triggered.
    pub async fn run_autoscaler(
        self: &Arc<Self>,
        rpc: &RpcClient,
        cancel: tokio_util::sync::CancellationToken,
    ) {
        let interval = Duration::from_secs(5);
        loop {
            tokio::select! {
                _ = tokio::time::sleep(interval) => {},
                _ = cancel.cancelled() => {
                    info!("Autoscaler shutting down");
                    return;
                }
            }

            if let Err(e) = self.autoscale_tick(rpc).await {
                error!(error = %e, "Autoscaler tick failed");
            }
        }
    }

    pub(crate) async fn autoscale_tick(&self, rpc: &RpcClient) -> Result<(), crate::Error> {
        let active = self.active_count();
        let _warm = self.warm_count();
        let load = self.per_key_load();

        self.reap_dead_slots();
        self.rotate_old_keys(rpc).await?;

        // Scale up when per-key load exceeds threshold
        if load > self.config.scale_up_per_key && active < self.config.max_keys as usize {
            let promoted = self.promote_warm_keys();
            if promoted > 0 {
                info!(
                    promoted,
                    per_key_load = load,
                    "Promoted warm keys to absorb load"
                );
            }

            let active_now = self.active_count();
            let still_overloaded = self.per_key_load() > self.config.scale_up_per_key;
            if still_overloaded
                && active_now < self.config.max_keys as usize
                && self.cooldown_elapsed()
            {
                let to_add = self
                    .config
                    .batch_size
                    .min(self.config.max_keys - active_now as u32);
                if to_add > 0 {
                    info!(
                        current = active_now,
                        adding = to_add,
                        per_key_load = load,
                        "Scaling up"
                    );
                    self.scale_up(rpc, to_add).await?;
                    self.last_scale_event.store(now_secs(), Ordering::Relaxed);
                }
            }
        }

        // Scale down when per-key load is low and we have spare keys
        if load < self.config.scale_down_per_key
            && active > self.config.min_keys as usize
            && self.cooldown_elapsed()
        {
            let to_remove = self
                .config
                .batch_size
                .min(active as u32 - self.config.min_keys);
            if to_remove > 0 {
                info!(
                    current = active,
                    removing = to_remove,
                    per_key_load = load,
                    "Scaling down"
                );
                self.scale_down(rpc, to_remove).await?;
                self.last_scale_event.store(now_secs(), Ordering::Relaxed);
            }
        }

        // Replenish warm buffer
        let total = self.active_count() + self.warm_count();
        if self.config.warm_buffer > 0
            && (self.warm_count() as u32) < self.config.warm_buffer
            && total < self.config.max_keys as usize
            && self.cooldown_elapsed()
        {
            let deficit = self.config.warm_buffer - self.warm_count() as u32;
            let can_add = (self.config.max_keys as usize - total) as u32;
            let to_warm = deficit.min(can_add).min(self.config.batch_size);
            if to_warm > 0 {
                info!(
                    warm = self.warm_count(),
                    adding = to_warm,
                    "Pre-warming spare keys"
                );
                self.pre_warm(rpc, to_warm).await?;
            }
        }

        Ok(())
    }

    pub(crate) fn cooldown_elapsed(&self) -> bool {
        let last = self.last_scale_event.load(Ordering::Relaxed);
        now_secs() - last >= self.config.cooldown.as_secs()
    }

    pub(crate) fn reap_dead_slots(&self) {
        for slot in self.read_slots().iter() {
            let st = slot.state.load(Ordering::Relaxed);
            if st == DRAINING && slot.in_flight.load(Ordering::Relaxed) == 0 {
                slot.state.store(DEAD, Ordering::Relaxed);
            }
        }

        let mut slots = self.write_slots();
        let before = slots.len();
        slots.retain(|s| s.state.load(Ordering::Relaxed) != DEAD);
        let removed = before - slots.len();
        if removed > 0 {
            info!(removed, remaining = slots.len(), "Compacted dead key slots");
        }
    }

    /// Promote all WARMUP keys to ACTIVE.
    pub(crate) fn promote_warm_keys(&self) -> usize {
        let mut promoted = 0;
        for slot in self.read_slots().iter() {
            if slot.state.load(Ordering::Relaxed) == WARMUP {
                slot.state.store(ACTIVE, Ordering::Relaxed);
                promoted += 1;
            }
        }
        promoted
    }

    /// Pre-warm: create keys on-chain in WARMUP state, ready for instant promotion.
    async fn pre_warm(&self, rpc: &RpcClient, count: u32) -> Result<(), crate::Error> {
        let before = self.read_slots().len();

        self.scale_up(rpc, count).await?;

        let slots = self.read_slots();
        for slot in slots.iter().skip(before) {
            if slot.state.load(Ordering::Relaxed) == ACTIVE {
                slot.state.store(WARMUP, Ordering::Relaxed);
            }
        }

        info!(warmed = slots.len() - before, "Pre-warmed spare keys");
        Ok(())
    }

    /// Rotate keys older than `max_key_age`. Reverts to ACTIVE on DeleteKey failure.
    pub(crate) async fn rotate_old_keys(&self, rpc: &RpcClient) -> Result<(), crate::Error> {
        let now = now_secs();
        let max_age = self.config.max_key_age.as_secs();
        let mut to_delete: Vec<near_crypto::PublicKey> = Vec::new();

        for slot in self.read_slots().iter() {
            if slot.state.load(Ordering::Relaxed) != ACTIVE {
                continue;
            }
            if now - slot.created_at < max_age {
                continue;
            }
            if slot.in_flight.load(Ordering::Relaxed) > 0 {
                continue;
            }
            slot.state.store(DRAINING, Ordering::Relaxed);
            to_delete.push(slot.signer.public_key());
        }

        if to_delete.is_empty() {
            return Ok(());
        }

        info!(
            count = to_delete.len(),
            "Draining aged keys for rotation — deleting on-chain"
        );

        if let Err(e) = self.submit_delete_keys(rpc, &to_delete).await {
            warn!(error = %e, "DeleteKey for rotated keys failed, reverting drain");
            for slot in self.read_slots().iter() {
                if slot.state.load(Ordering::Relaxed) == DRAINING
                    && to_delete.contains(&slot.signer.public_key())
                {
                    slot.state.store(ACTIVE, Ordering::Relaxed);
                }
            }
            return Err(e);
        }

        if let Err(e) = self.persist_keys() {
            warn!(error = %e, "Failed to persist key store after rotation");
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::super::slot::{now_secs, KeySlot, ACTIVE, DRAINING};
    use super::super::tests::{
        dummy_rpc, make_test_pool, make_test_pool_with_config, make_test_signer,
    };
    use crate::config::ScalingConfig;
    use std::sync::atomic::Ordering;
    use std::sync::Arc;
    use std::time::Duration;

    // --- Reap dead slots ---

    #[test]
    fn test_reap_dead_slots_transitions_and_compacts() {
        let pool = make_test_pool(3);
        {
            let slots = pool.read_slots();
            slots[0].state.store(DRAINING, Ordering::Relaxed);
        }
        assert_eq!(pool.draining_count(), 1);
        assert_eq!(pool.active_count(), 2);

        pool.reap_dead_slots();

        assert_eq!(pool.read_slots().len(), 2);
        assert_eq!(pool.draining_count(), 0);
        assert_eq!(pool.active_count(), 2);
    }

    #[test]
    fn test_reap_dead_slots_preserves_inflight_draining() {
        let pool = make_test_pool(3);
        {
            let slots = pool.read_slots();
            slots[1].state.store(DRAINING, Ordering::Relaxed);
            slots[1].in_flight.store(2, Ordering::Relaxed);
        }

        pool.reap_dead_slots();

        assert_eq!(pool.read_slots().len(), 3);
        assert_eq!(pool.draining_count(), 1);
    }

    #[test]
    fn test_reap_dead_slots_multiple_dead() {
        let pool = make_test_pool(5);
        {
            let slots = pool.read_slots();
            slots[0].state.store(DRAINING, Ordering::Relaxed);
            slots[2].state.store(DRAINING, Ordering::Relaxed);
            slots[4].state.store(DRAINING, Ordering::Relaxed);
        }

        pool.reap_dead_slots();

        assert_eq!(pool.read_slots().len(), 2);
        assert_eq!(pool.active_count(), 2);
        assert_eq!(pool.draining_count(), 0);
    }

    #[test]
    fn test_reap_dead_slots_noop_when_clean() {
        let pool = make_test_pool(3);
        pool.reap_dead_slots();
        assert_eq!(pool.read_slots().len(), 3);
        assert_eq!(pool.active_count(), 3);
    }

    // --- Promote warm keys ---

    #[test]
    fn test_promote_warm_keys_activates() {
        let pool = make_test_pool(0);
        {
            let mut slots = pool.write_slots();
            for i in 0..3u8 {
                let slot = KeySlot::new(make_test_signer(i + 1), 1000);
                slots.push(Arc::new(slot));
            }
        }
        assert_eq!(pool.warm_count(), 3);
        assert_eq!(pool.active_count(), 0);

        let promoted = pool.promote_warm_keys();

        assert_eq!(promoted, 3);
        assert_eq!(pool.warm_count(), 0);
        assert_eq!(pool.active_count(), 3);
    }

    #[test]
    fn test_promote_ignores_non_warmup() {
        let pool = make_test_pool(2);
        {
            let slots = pool.read_slots();
            slots[0].state.store(DRAINING, Ordering::Relaxed);
        }
        let promoted = pool.promote_warm_keys();
        assert_eq!(promoted, 0);
        assert_eq!(pool.draining_count(), 1);
        assert_eq!(pool.active_count(), 1);
    }

    #[test]
    fn test_promote_warm_keys_partial() {
        let pool = make_test_pool(2);
        {
            let mut slots = pool.write_slots();
            slots.push(Arc::new(KeySlot::new(make_test_signer(10), 1000)));
        }
        assert_eq!(pool.active_count(), 2);
        assert_eq!(pool.warm_count(), 1);

        let promoted = pool.promote_warm_keys();
        assert_eq!(promoted, 1);
        assert_eq!(pool.active_count(), 3);
        assert_eq!(pool.warm_count(), 0);
    }

    #[test]
    fn test_warm_buffer_config_default() {
        let config = ScalingConfig::default();
        assert_eq!(config.warm_buffer, 2);
    }

    #[test]
    fn test_warm_buffer_zero_disables_prewarming() {
        let config = ScalingConfig {
            warm_buffer: 0,
            ..ScalingConfig::default()
        };
        let pool = make_test_pool_with_config(2, config);
        assert_eq!(pool.config.warm_buffer, 0);
        assert_eq!(pool.warm_count(), 0);
    }

    #[tokio::test]
    async fn test_autoscale_tick_promotes_warm_before_scale_up() {
        let config = ScalingConfig {
            min_keys: 2,
            max_keys: 10,
            scale_up_per_key: 5.0,
            warm_buffer: 0,
            ..ScalingConfig::default()
        };
        let pool = make_test_pool_with_config(1, config);

        {
            let mut slots = pool.write_slots();
            slots.push(Arc::new(KeySlot::new(make_test_signer(10), 2000)));
        }
        assert_eq!(pool.active_count(), 1);
        assert_eq!(pool.warm_count(), 1);

        {
            let slots = pool.read_slots();
            for s in slots.iter() {
                if s.state.load(Ordering::Relaxed) == ACTIVE {
                    s.in_flight.store(12, Ordering::Relaxed);
                }
            }
        }

        let rpc = dummy_rpc();
        let _ = pool.autoscale_tick(&rpc).await;

        assert_eq!(pool.active_count(), 2);
        assert_eq!(pool.warm_count(), 0);
    }

    // --- Rotate old keys ---

    #[tokio::test]
    async fn test_rotate_old_keys_drains_aged() {
        let pool = make_test_pool(0);
        let rpc = dummy_rpc();
        {
            let mut slots = pool.write_slots();
            for i in 0..3u8 {
                let mut slot = KeySlot::new(make_test_signer(i + 1), 1000);
                slot.state.store(ACTIVE, Ordering::Relaxed);
                slot.created_at = now_secs() - 90_000;
                slots.push(Arc::new(slot));
            }
        }
        assert_eq!(pool.active_count(), 3);

        let result = pool.rotate_old_keys(&rpc).await;
        assert!(result.is_err(), "Expected RPC failure with dummy client");

        assert_eq!(pool.active_count(), 3);
        assert_eq!(pool.draining_count(), 0);
    }

    #[tokio::test]
    async fn test_rotate_old_keys_skips_young() {
        let pool = make_test_pool(3);
        let rpc = dummy_rpc();

        pool.rotate_old_keys(&rpc).await.unwrap();

        assert_eq!(pool.active_count(), 3);
        assert_eq!(pool.draining_count(), 0);
    }

    #[tokio::test]
    async fn test_rotate_old_keys_skips_inflight() {
        let pool = make_test_pool(0);
        let rpc = dummy_rpc();
        {
            let mut slots = pool.write_slots();
            let mut slot = KeySlot::new(make_test_signer(1), 1000);
            slot.state.store(ACTIVE, Ordering::Relaxed);
            slot.created_at = now_secs() - 90_000;
            slot.in_flight.store(1, Ordering::Relaxed);
            slots.push(Arc::new(slot));
        }

        pool.rotate_old_keys(&rpc).await.unwrap();

        assert_eq!(pool.active_count(), 1);
        assert_eq!(pool.draining_count(), 0);
    }

    #[tokio::test]
    async fn test_rotate_mixed_ages() {
        let pool = make_test_pool(0);
        let rpc = dummy_rpc();
        {
            let mut slots = pool.write_slots();

            let mut old = KeySlot::new(make_test_signer(1), 1000);
            old.state.store(ACTIVE, Ordering::Relaxed);
            old.created_at = now_secs() - 90_000;
            slots.push(Arc::new(old));

            let young = KeySlot::new(make_test_signer(2), 1001);
            young.state.store(ACTIVE, Ordering::Relaxed);
            slots.push(Arc::new(young));
        }

        let result = pool.rotate_old_keys(&rpc).await;
        assert!(result.is_err(), "Expected RPC failure with dummy client");

        assert_eq!(pool.active_count(), 2);
        assert_eq!(pool.draining_count(), 0);
    }

    // --- Cooldown ---

    #[test]
    fn test_cooldown_not_elapsed() {
        let pool = make_test_pool(3);
        pool.last_scale_event.store(now_secs(), Ordering::Relaxed);
        assert!(!pool.cooldown_elapsed());
    }

    #[test]
    fn test_cooldown_elapsed() {
        let pool = make_test_pool(3);
        pool.last_scale_event
            .store(now_secs() - 60, Ordering::Relaxed);
        assert!(pool.cooldown_elapsed());
    }

    #[test]
    fn test_cooldown_never_scaled() {
        let pool = make_test_pool(3);
        assert!(pool.cooldown_elapsed());
    }

    // --- Autoscale tick ---

    #[tokio::test]
    async fn test_autoscale_tick_balanced_no_scaling() {
        let config = ScalingConfig {
            min_keys: 5,
            max_keys: 5,
            ..ScalingConfig::default()
        };
        let pool = make_test_pool_with_config(5, config);
        let rpc = dummy_rpc();

        pool.autoscale_tick(&rpc).await.unwrap();

        assert_eq!(pool.active_count(), 5);
    }

    #[tokio::test]
    async fn test_autoscale_tick_reaps_dead_and_keeps_warm() {
        let config = ScalingConfig {
            min_keys: 2,
            max_keys: 2,
            warm_buffer: 0,
            ..ScalingConfig::default()
        };
        let pool = make_test_pool_with_config(0, config);
        {
            let mut slots = pool.write_slots();
            let drain = KeySlot::new(make_test_signer(1), 1000);
            drain.state.store(DRAINING, Ordering::Relaxed);
            slots.push(Arc::new(drain));
            let warm = KeySlot::new(make_test_signer(2), 1001);
            slots.push(Arc::new(warm));
            let active = KeySlot::new(make_test_signer(3), 1002);
            active.state.store(ACTIVE, Ordering::Relaxed);
            slots.push(Arc::new(active));
        }
        let rpc = dummy_rpc();

        pool.autoscale_tick(&rpc).await.unwrap();

        assert_eq!(pool.read_slots().len(), 2);
        assert_eq!(pool.active_count(), 1);
        assert_eq!(pool.warm_count(), 1);
        assert_eq!(pool.draining_count(), 0);
    }

    // --- Scale down ---

    #[tokio::test]
    async fn test_scale_down_reverts_on_rpc_failure() {
        let config = ScalingConfig {
            min_keys: 2,
            max_keys: 10,
            scale_down_idle: Duration::from_secs(0),
            ..ScalingConfig::default()
        };
        let pool = make_test_pool_with_config(5, config);
        let rpc = dummy_rpc();

        assert_eq!(pool.active_count(), 5);

        let result = pool.scale_down(&rpc, 2).await;
        assert!(result.is_err());

        assert_eq!(pool.active_count(), 5);
        assert_eq!(pool.draining_count(), 0);
    }

    #[tokio::test]
    async fn test_scale_down_skips_recently_used() {
        let config = ScalingConfig {
            min_keys: 1,
            max_keys: 10,
            scale_down_idle: Duration::from_secs(300),
            ..ScalingConfig::default()
        };
        let pool = make_test_pool_with_config(3, config);
        {
            let slots = pool.read_slots();
            for s in slots.iter() {
                s.last_used.store(now_secs(), Ordering::Relaxed);
            }
        }
        let rpc = dummy_rpc();

        let result = pool.scale_down(&rpc, 2).await;
        assert!(result.is_ok());
        assert_eq!(pool.active_count(), 3);
    }

    #[tokio::test]
    async fn test_scale_down_skips_inflight() {
        let config = ScalingConfig {
            min_keys: 1,
            max_keys: 10,
            scale_down_idle: Duration::from_secs(0),
            ..ScalingConfig::default()
        };
        let pool = make_test_pool_with_config(2, config);
        {
            let slots = pool.read_slots();
            for s in slots.iter() {
                s.in_flight.store(1, Ordering::Relaxed);
            }
        }
        let rpc = dummy_rpc();

        let result = pool.scale_down(&rpc, 1).await;
        assert!(result.is_ok());
        assert_eq!(pool.active_count(), 2);
    }
}
