'use client';

import { useEffect, useRef, useState } from 'react';
import type { JobSearchRow, OfferRecord } from '@onsocial/sdk';
import {
  OsSheetAction,
  OsSheetActions,
  standingIdentityLabel,
} from '@onsocial/ui';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { accountIdsEqual } from '@/lib/account-match';
import type { ProfileListAccount } from '@/lib/profile-list-account';
import {
  fetchAccountJobs,
  JOBS_CHANGED_EVENT,
  openJobsFrom,
} from '@/lib/profile-jobs';
import { fetchAccountOffers, OFFERS_CHANGED_EVENT } from '@/lib/profile-offers';
import { osRowActionClassName } from '@/lib/os-row-action';
import { discoverDirectoryActionVisibility } from '@/features/discover/discover-directory-action-visibility';
import type { DiscoverDirectoryDrawers } from '@/features/discover/discover-directory-drawers';

type DrawersComponent = typeof DiscoverDirectoryDrawers;

/**
 * See offers / See hiring on Offers and Hiring rows.
 * The row link still opens the profile. Each verb is omitted at count zero.
 */
export function DiscoverDirectoryActions({
  account,
}: {
  account: ProfileListAccount;
}) {
  const { accountId: viewerId, isConnected } = useAppWallet();
  const visibility = discoverDirectoryActionVisibility(account);
  const profileName = standingIdentityLabel(
    account.accountId,
    account.name
  ).label;
  const isOwner =
    isConnected &&
    Boolean(viewerId) &&
    accountIdsEqual(viewerId!, account.accountId);
  const alive = useRef(true);
  const [Drawers, setDrawers] = useState<DrawersComponent | null>(null);
  const [offers, setOffers] = useState<OfferRecord[]>([]);
  const [jobs, setJobs] = useState<JobSearchRow[]>([]);
  const [offersOpen, setOffersOpen] = useState(false);
  const [hiringOpen, setHiringOpen] = useState(false);
  const [offersPending, setOffersPending] = useState(false);
  const [hiringPending, setHiringPending] = useState(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    const onOffers = (event: Event) => {
      const detail = (event as CustomEvent<{ accountId?: string }>).detail;
      if (
        detail?.accountId &&
        !accountIdsEqual(detail.accountId, account.accountId)
      ) {
        return;
      }
      void fetchAccountOffers(account.accountId).then((next) => {
        if (alive.current) setOffers(next);
      });
    };
    const onJobs = (event: Event) => {
      const detail = (event as CustomEvent<{ accountId?: string }>).detail;
      if (
        detail?.accountId &&
        !accountIdsEqual(detail.accountId, account.accountId)
      ) {
        return;
      }
      void fetchAccountJobs(account.accountId, { includeClosed: isOwner }).then(
        (next) => {
          if (alive.current) setJobs(openJobsFrom(next));
        }
      );
    };
    window.addEventListener(OFFERS_CHANGED_EVENT, onOffers);
    window.addEventListener(JOBS_CHANGED_EVENT, onJobs);
    return () => {
      window.removeEventListener(OFFERS_CHANGED_EVENT, onOffers);
      window.removeEventListener(JOBS_CHANGED_EVENT, onJobs);
    };
  }, [account.accountId, isOwner]);

  if (!visibility.offers && !visibility.hiring) return null;

  const ensureDrawers = async () => {
    if (Drawers) return Drawers;
    const mod = await import('@/features/discover/discover-directory-drawers');
    if (!alive.current) return null;
    setDrawers(() => mod.DiscoverDirectoryDrawers);
    return mod.DiscoverDirectoryDrawers;
  };

  const openOffers = async () => {
    if (offersPending) return;
    setOffersPending(true);
    try {
      const [, next] = await Promise.all([
        ensureDrawers(),
        fetchAccountOffers(account.accountId).catch(() => [] as OfferRecord[]),
      ]);
      if (!alive.current) return;
      setOffers(next);
      if (isOwner || next.length > 0) setOffersOpen(true);
    } finally {
      if (alive.current) setOffersPending(false);
    }
  };

  const openHiring = async () => {
    if (hiringPending) return;
    setHiringPending(true);
    try {
      const [, next] = await Promise.all([
        ensureDrawers(),
        fetchAccountJobs(account.accountId, { includeClosed: isOwner })
          .then((rows) => openJobsFrom(rows))
          .catch(() => [] as JobSearchRow[]),
      ]);
      if (!alive.current) return;
      setJobs(next);
      if (isOwner || next.length > 0) setHiringOpen(true);
    } finally {
      if (alive.current) setHiringPending(false);
    }
  };

  return (
    <>
      <div className="discover-directory-actions">
        {visibility.offers ? (
          <OsSheetActions
            className={osRowActionClassName}
            layout="row-compact"
            tone="frosted-primary"
            size="sm"
            borderless
          >
            <OsSheetAction
              type="button"
              variant="primary"
              ready
              pending={offersPending}
              pendingLabel="Opening offers"
              aria-haspopup="dialog"
              aria-expanded={offersOpen}
              aria-label={`See offers from ${profileName}`}
              onClick={() => {
                void openOffers();
              }}
            >
              See offers
            </OsSheetAction>
          </OsSheetActions>
        ) : null}
        {visibility.hiring ? (
          <OsSheetActions
            className={osRowActionClassName}
            layout="row-compact"
            tone="frosted-primary"
            size="sm"
            borderless
          >
            <OsSheetAction
              type="button"
              variant="primary"
              ready
              pending={hiringPending}
              pendingLabel="Opening hiring"
              aria-haspopup="dialog"
              aria-expanded={hiringOpen}
              aria-label={`See hiring at ${profileName}`}
              onClick={() => {
                void openHiring();
              }}
            >
              See hiring
            </OsSheetAction>
          </OsSheetActions>
        ) : null}
      </div>
      {Drawers ? (
        <Drawers
          accountId={account.accountId}
          profileName={profileName}
          kind={account.kind ?? null}
          offersOpen={offersOpen}
          hiringOpen={hiringOpen}
          offers={offers}
          jobs={jobs}
          onOffersOpenChange={setOffersOpen}
          onHiringOpenChange={setHiringOpen}
          isOwner={isOwner}
        />
      ) : null}
    </>
  );
}
