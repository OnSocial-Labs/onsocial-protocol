'use client';

import { useRef, useState } from 'react';
import { GuildFacepile } from '@/features/guilds/guild-facepile';
import { ScarceFansSheet } from '@/features/scarces/scarce-fans-sheet';
import { useSheetMounted } from '@/hooks/use-sheet-mounted';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  arePostAuthorProfilesResolved,
  usePostAuthorProfiles,
} from '@/hooks/use-post-author-profiles';
import { warmProfileListAccounts } from '@/lib/load-profile-list-accounts';
import {
  loadDropFanIds,
  peekDropFanIds,
  warmDropFanIds,
} from '@/lib/scarce-drop-fans';

/** Loved fans on a drop row — facepile or count-only fallback. */
export function DropRowFans({
  fanIds,
  fanCount,
}: {
  fanIds?: string[];
  fanCount: number;
}) {
  const ids = (fanIds ?? []).slice(0, 3);
  const profiles = usePostAuthorProfiles(ids);
  const profilesLoading = ids.length > 0 && !arePostAuthorProfilesResolved(ids);
  if (ids.length === 0) {
    return (
      <span className="drops-discovery-deal-bit">
        {fanCount === 1 ? '1 fan' : `${fanCount} fans`}
      </span>
    );
  }
  return (
    <span className="drops-discovery-deal-fans">
      <GuildFacepile
        memberIds={ids}
        profiles={profiles}
        memberCount={fanCount}
        countUnit={{ one: 'fan', other: 'fans' }}
        slots={Math.min(3, ids.length)}
        loading={profilesLoading}
        showCount
        className="drops-discovery-fans-facepile"
      />
    </span>
  );
}

/** Facepile opens the people. The row title still opens the drop. */
export function DropFansButton({
  creatorId,
  collectionId,
  title,
  fanIds,
  fanCount,
}: {
  creatorId: string;
  collectionId: string;
  title: string;
  fanIds?: string[];
  fanCount: number;
}) {
  const { accountId: viewerAccountId } = useAppWallet();
  const requestRef = useRef(0);
  const [open, setOpen] = useState(false);
  const [warm, setWarm] = useState(false);
  const sheetMounted = useSheetMounted(open || warm);
  const peeked = peekDropFanIds(creatorId, collectionId);
  const [roster, setRoster] = useState<string[]>(
    () => peeked ?? fanIds ?? []
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const label = fanCount === 1 ? '1 fan' : `${fanCount} fans`;

  const warmFans = () => {
    setWarm(true);
    warmDropFanIds(creatorId, collectionId);
    const seed = peekDropFanIds(creatorId, collectionId) ?? fanIds ?? [];
    if (seed.length > 0) {
      setRoster(seed);
      warmProfileListAccounts(seed, viewerAccountId ?? null);
    }
  };

  const openFans = () => {
    const request = requestRef.current + 1;
    requestRef.current = request;
    const cached =
      peekDropFanIds(creatorId, collectionId) ?? fanIds ?? [];
    setWarm(true);
    setOpen(true);
    setRoster(cached);
    setError(false);
    setLoading(cached.length < fanCount);
    if (cached.length > 0) {
      warmProfileListAccounts(cached, viewerAccountId ?? null);
    }
    void loadDropFanIds(creatorId, collectionId)
      .then((ids) => {
        if (requestRef.current !== request) return;
        setRoster(ids);
        setLoading(false);
        setError(false);
        warmProfileListAccounts(ids, viewerAccountId ?? null);
      })
      .catch(() => {
        if (requestRef.current !== request) return;
        setLoading(false);
        if (cached.length === 0) setError(true);
      });
  };

  return (
    <>
      <button
        type="button"
        className="drops-discovery-fans-button"
        aria-label={`See fans, ${label}`}
        onPointerDown={(event) => {
          event.stopPropagation();
          warmFans();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          openFans();
        }}
      >
        <DropRowFans fanIds={fanIds} fanCount={fanCount} />
      </button>
      {sheetMounted ? (
        <ScarceFansSheet
          open={open}
          onClose={() => setOpen(false)}
          fanIds={roster}
          fanCount={loading ? fanCount : roster.length}
          dropTitle={title}
          idsLoading={loading && roster.length === 0}
          idsError={error}
        />
      ) : null}
    </>
  );
}
