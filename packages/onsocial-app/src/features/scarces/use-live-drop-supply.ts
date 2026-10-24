'use client';

import { useEffect, type Dispatch, type SetStateAction } from 'react';
import {
  applyDropCommerce,
  applyDropSupply,
  dropCommerceFromCurrent,
  readCollectionSupply,
  type CollectionView,
  type DropCommercePatch,
} from '@/features/scarces/collections-data';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';

/** Quiet re-read of the open drop. Catalog pages stay on their own memory. */
export const LIVE_DROP_SUPPLY_MS = 8_000;

async function readDropCommerce(
  collectionId: string
): Promise<DropCommercePatch | undefined> {
  try {
    const row =
      await createReadOnlyOnSocialClient().query.scarces.collectionCurrent(
        collectionId
      );
    if (!row) return;
    return dropCommerceFromCurrent(row) ?? undefined;
  } catch {
    return;
  }
}

/**
 * While this drop can still be minted, re-read its commerce fields and patch
 * them onto the open view. A failed read keeps the number on screen.
 */
export function useLiveDropSupply(
  collectionId: string,
  enabled: boolean,
  setView: Dispatch<SetStateAction<CollectionView | null>>
) {
  useEffect(() => {
    if (!enabled) return;
    const id = collectionId.trim();
    if (!id) return;

    let stopped = false;
    let generation = 0;
    let timer = 0;

    const tick = () => {
      const gen = ++generation;
      void Promise.all([readDropCommerce(id), readCollectionSupply(id)]).then(
        ([indexed, chain]) => {
          if (stopped || gen !== generation) return;
          if (!indexed && !chain) return;
          setView((prev) => {
            if (!prev || prev.collectionId !== id) return prev;
            const priced = indexed ? applyDropCommerce(prev, indexed) : prev;
            return chain ? applyDropSupply(priced, chain) : priced;
          });
        }
      );
    };

    const arm = () => {
      window.clearInterval(timer);
      timer = 0;
      if (document.hidden) return;
      timer = window.setInterval(tick, LIVE_DROP_SUPPLY_MS);
    };

    const onVisibility = () => {
      if (document.hidden) {
        window.clearInterval(timer);
        timer = 0;
        return;
      }
      tick();
      arm();
    };

    if (!document.hidden) tick();
    arm();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [collectionId, enabled, setView]);
}
