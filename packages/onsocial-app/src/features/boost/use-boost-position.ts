'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  BoostAccountView,
  BoostLockStatus,
  BoostRewardsLiveSnapshot,
} from '@onsocial/sdk';
import {
  extrapolateClaimableYocto,
  extrapolateFromClientAnchor,
  fetchBoostAccount,
  fetchBoostLockStatus,
  fetchBoostRewardsLiveSnapshot,
  parseYoctoOrZero,
  type BoostLiveCounterAnchor,
} from '@/features/boost/boost-position';

/** Gateway resync interval while the sheet is open. */
const BOOST_LIVE_RESYNC_MS = 30_000;
/** Smooth accrual — same cadence as the portal live counter. */
const BOOST_LIVE_TICK_MS = 100;
/** Focus resync only after the tab was hidden at least this long. */
const BOOST_FOCUS_RESYNC_MS = BOOST_LIVE_RESYNC_MS;

export interface BoostPosition {
  account: BoostAccountView | null;
  lockStatus: BoostLockStatus | null;
  loaded: boolean;
  hasPosition: boolean;
  lockedYocto: bigint;
  /** Claimable rewards, smooth client-anchored accrual while `live`. */
  claimableYocto: bigint;
  ratePerSecondYocto: bigint;
  canUnlock: boolean;
  refresh: () => Promise<void>;
  /**
   * After collect / unlock — pause accrual and let the next snapshot reset
   * the counter downward (portal post-claim behavior).
   */
  resetLiveCounterAfterClaim: () => void;
}

/**
 * Owner boost position — account view, lock status, and a portal-style
 * live claimable counter (100ms client anchor, no mid-accrual decreases).
 * Pass `live: true` while the boost sheet is open.
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
  const [claimableYocto, setClaimableYocto] = useState(0n);
  const [ratePerSecondYocto, setRatePerSecondYocto] = useState(0n);

  const requestSeqRef = useRef(0);
  const claimableYoctoRef = useRef(0n);
  const liveAnchorRef = useRef<BoostLiveCounterAnchor | null>(null);
  const livePausedRef = useRef(false);
  const allowDecreaseRef = useRef(false);
  const postClaimRefreshPendingRef = useRef(false);
  const lastAppliedAsOfRef = useRef<number | null>(null);
  const tabHiddenAtRef = useRef<number | null>(null);

  const setClaimableYoctoValue = useCallback((value: bigint) => {
    claimableYoctoRef.current = value;
    setClaimableYocto(value);
  }, []);

  const applySnapshotToCounter = useCallback(
    (
      next: BoostRewardsLiveSnapshot,
      applyOptions: { allowDecrease: boolean }
    ) => {
      const rate = parseYoctoOrZero(next.rewards_per_second);
      const chainAtNow = extrapolateClaimableYocto(next, Date.now());
      const displayed = claimableYoctoRef.current;
      const baseYocto = applyOptions.allowDecrease
        ? chainAtNow
        : chainAtNow > displayed
          ? chainAtNow
          : displayed;

      liveAnchorRef.current = {
        baseYocto,
        clientMs: Date.now(),
        ratePerSecondYocto: rate,
      };
      lastAppliedAsOfRef.current = next.as_of_timestamp_ns;
      setRatePerSecondYocto(rate);
      setClaimableYoctoValue(
        rate > 0n
          ? extrapolateFromClientAnchor(liveAnchorRef.current)
          : baseYocto
      );
    },
    [setClaimableYoctoValue]
  );

  const refresh = useCallback(async () => {
    const seq = ++requestSeqRef.current;
    try {
      const [nextAccount, nextLockStatus, nextSnapshot] = await Promise.all([
        fetchBoostAccount(accountId),
        fetchBoostLockStatus(accountId),
        fetchBoostRewardsLiveSnapshot(accountId),
      ]);
      if (seq !== requestSeqRef.current) return;

      // Initial load or post-claim: take chain. Soft refresh: never drop.
      const allowDecrease =
        allowDecreaseRef.current || liveAnchorRef.current == null;
      postClaimRefreshPendingRef.current = false;
      allowDecreaseRef.current = false;
      livePausedRef.current = false;

      // Anchor before `loaded` so the sheet never paints 0 → real amount.
      applySnapshotToCounter(nextSnapshot, { allowDecrease });

      setAccount(nextAccount);
      setLockStatus(nextLockStatus);
      setSnapshot(nextSnapshot);
    } catch {
      if (seq !== requestSeqRef.current) return;
      setAccount(null);
      setLockStatus(null);
      setSnapshot(null);
      setClaimableYoctoValue(0n);
      setRatePerSecondYocto(0n);
      liveAnchorRef.current = null;
      lastAppliedAsOfRef.current = null;
      postClaimRefreshPendingRef.current = false;
    } finally {
      if (seq === requestSeqRef.current) setLoaded(true);
    }
  }, [accountId, applySnapshotToCounter, setClaimableYoctoValue]);

  const resetLiveCounterAfterClaim = useCallback(() => {
    livePausedRef.current = true;
    allowDecreaseRef.current = true;
    postClaimRefreshPendingRef.current = true;
  }, []);

  useEffect(() => {
    setAccount(null);
    setLockStatus(null);
    setSnapshot(null);
    setLoaded(false);
    setClaimableYoctoValue(0n);
    setRatePerSecondYocto(0n);
    liveAnchorRef.current = null;
    lastAppliedAsOfRef.current = null;
    livePausedRef.current = false;
    allowDecreaseRef.current = false;
    postClaimRefreshPendingRef.current = false;
    tabHiddenAtRef.current = null;
    void refresh();
  }, [refresh, setClaimableYoctoValue]);

  // Periodic / focus resync only — refresh() applies its own snapshot.
  useEffect(() => {
    if (!snapshot) return;
    if (lastAppliedAsOfRef.current === snapshot.as_of_timestamp_ns) return;
    if (allowDecreaseRef.current && postClaimRefreshPendingRef.current) {
      return;
    }
    const allowDecrease = allowDecreaseRef.current;
    if (allowDecrease) {
      allowDecreaseRef.current = false;
    }
    livePausedRef.current = false;
    applySnapshotToCounter(snapshot, { allowDecrease });
  }, [applySnapshotToCounter, snapshot]);

  // Periodic snapshot resync + focus resync after a long background.
  useEffect(() => {
    if (!live) return;

    const resync = () => {
      void fetchBoostRewardsLiveSnapshot(accountId)
        .then((next) => {
          setSnapshot(next);
        })
        .catch(() => {});
    };

    const interval = setInterval(resync, BOOST_LIVE_RESYNC_MS);

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        tabHiddenAtRef.current = Date.now();
        return;
      }
      if (document.visibilityState !== 'visible') return;
      const hiddenAt = tabHiddenAtRef.current;
      tabHiddenAtRef.current = null;
      if (hiddenAt === null) return;
      if (Date.now() - hiddenAt >= BOOST_FOCUS_RESYNC_MS) {
        resync();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [accountId, live]);

  // 100ms client-anchor tick — only advances upward.
  useEffect(() => {
    if (!live || ratePerSecondYocto <= 0n || !snapshot) return;

    const tick = () => {
      if (livePausedRef.current || !liveAnchorRef.current) return;
      const next = extrapolateFromClientAnchor(liveAnchorRef.current);
      if (next >= claimableYoctoRef.current) {
        setClaimableYoctoValue(next);
      }
    };

    tick();
    const interval = setInterval(tick, BOOST_LIVE_TICK_MS);
    return () => clearInterval(interval);
  }, [live, ratePerSecondYocto, setClaimableYoctoValue, snapshot]);

  const lockedYocto = account ? parseYoctoOrZero(account.locked_amount) : 0n;
  const hasPosition = lockedYocto > 0n;
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
    resetLiveCounterAfterClaim,
  };
}
