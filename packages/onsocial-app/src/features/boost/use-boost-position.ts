'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  BoostAccountView,
  BoostLockStatus,
  BoostRewardsLiveSnapshot,
} from '@onsocial/sdk';
import {
  extrapolateClaimableYocto,
  fetchBoostAccount,
  fetchBoostLockStatus,
  fetchBoostRewardsLiveSnapshot,
  parseYoctoOrZero,
} from '@/features/boost/boost-position';

/** Gateway resync interval while the sheet is open. */
const BOOST_LIVE_RESYNC_MS = 30_000;
/** Client-side accrual tick — calm 1s cadence for a sheet counter. */
const BOOST_LIVE_TICK_MS = 1_000;

export interface BoostPosition {
  account: BoostAccountView | null;
  lockStatus: BoostLockStatus | null;
  loaded: boolean;
  hasPosition: boolean;
  lockedYocto: bigint;
  /** Claimable rewards, extrapolated forward while `live`. */
  claimableYocto: bigint;
  ratePerSecondYocto: bigint;
  canUnlock: boolean;
  refresh: () => Promise<void>;
}

/**
 * Owner boost position — account view, lock status, and a live-accruing
 * claimable counter. Pass `live: true` while the boost sheet is open to
 * enable the accrual tick and periodic chain resync.
 */
export function useBoostPosition(
  accountId: string,
  options: { live?: boolean } = {}
): BoostPosition {
  const live = options.live ?? false;
  const [account, setAccount] = useState<BoostAccountView | null>(null);
  const [lockStatus, setLockStatus] = useState<BoostLockStatus | null>(null);
  const [snapshot, setSnapshot] = useState<BoostRewardsLiveSnapshot | null>(
    null
  );
  const [loaded, setLoaded] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const requestSeqRef = useRef(0);

  const refresh = useCallback(async () => {
    const seq = ++requestSeqRef.current;
    try {
      const [nextAccount, nextLockStatus, nextSnapshot] = await Promise.all([
        fetchBoostAccount(accountId),
        fetchBoostLockStatus(accountId),
        fetchBoostRewardsLiveSnapshot(accountId),
      ]);
      if (seq !== requestSeqRef.current) return;
      setAccount(nextAccount);
      setLockStatus(nextLockStatus);
      setSnapshot(nextSnapshot);
      setNowMs(Date.now());
    } catch {
      if (seq !== requestSeqRef.current) return;
      setAccount(null);
      setLockStatus(null);
      setSnapshot(null);
    } finally {
      if (seq === requestSeqRef.current) setLoaded(true);
    }
  }, [accountId]);

  useEffect(() => {
    setAccount(null);
    setLockStatus(null);
    setSnapshot(null);
    setLoaded(false);
    void refresh();
  }, [refresh]);

  // Periodic snapshot resync keeps the counter anchored to chain state.
  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    const interval = setInterval(() => {
      void fetchBoostRewardsLiveSnapshot(accountId)
        .then((next) => {
          if (!cancelled) {
            setSnapshot(next);
            setNowMs(Date.now());
          }
        })
        .catch(() => {});
    }, BOOST_LIVE_RESYNC_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [accountId, live]);

  const ratePerSecondYocto = snapshot
    ? parseYoctoOrZero(snapshot.rewards_per_second)
    : 0n;
  const accruing = live && ratePerSecondYocto > 0n;

  useEffect(() => {
    if (!accruing) return;
    const interval = setInterval(
      () => setNowMs(Date.now()),
      BOOST_LIVE_TICK_MS
    );
    return () => clearInterval(interval);
  }, [accruing]);

  const lockedYocto = account ? parseYoctoOrZero(account.locked_amount) : 0n;
  const hasPosition = lockedYocto > 0n;
  const claimableYocto = snapshot
    ? extrapolateClaimableYocto(snapshot, nowMs)
    : 0n;
  const lockExpired =
    hasPosition &&
    account != null &&
    (lockStatus?.lock_expired ??
      (account.unlock_at > 0 && Date.now() * 1_000_000 >= account.unlock_at));
  const canUnlock = Boolean(
    hasPosition && (lockStatus?.can_unlock ?? lockExpired)
  );

  return {
    account,
    lockStatus,
    loaded,
    hasPosition,
    lockedYocto,
    claimableYocto,
    ratePerSecondYocto,
    canUnlock,
    refresh,
  };
}
