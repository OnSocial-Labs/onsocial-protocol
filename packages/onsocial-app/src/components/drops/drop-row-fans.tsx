'use client';

import { useEffect, useRef, useState } from 'react';
import { GuildFacepile } from '@/features/guilds/guild-facepile';
import { ScarceFansSheet } from '@/features/scarces/scarce-fans-sheet';
import { useSheetMounted } from '@/hooks/use-sheet-mounted';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { warmProfileListAccounts } from '@/lib/load-profile-list-accounts';
import {
  loadDropFanIds,
  peekDropFanIds,
  warmDropFanIds,
} from '@/lib/scarce-drop-fans';

/** Same pending chrome on drop rows and the drop face — discovery facepile CSS. */
export function DropRowFansPending() {
  return (
    <span className="drops-discovery-deal-fans" aria-hidden>
      <GuildFacepile
        memberIds={[]}
        profiles={{}}
        slots={3}
        loading
        showCount
        countUnit={{ one: 'fan', other: 'fans' }}
        className="drops-discovery-fans-facepile"
      />
    </span>
  );
}

function fanCountLabel(fanCount: number): string {
  return fanCount === 1 ? '1 fan' : `${fanCount} fans`;
}

/**
 * Loved fans on a drop row — facepile or count-only fallback.
 * Count-only soft-fill must resolve ids (or fall back to text) — never leave
 * the facepile shimmering forever with `loading` and no member ids.
 */
export function DropRowFans({
  creatorId,
  collectionId,
  fanIds,
  fanCount,
}: {
  creatorId: string;
  collectionId: string;
  fanIds?: string[];
  fanCount: number;
}) {
  const peeked = peekDropFanIds(creatorId, collectionId);
  const [roster, setRoster] = useState<string[]>(
    () => fanIds ?? peeked ?? []
  );
  const [rosterSettled, setRosterSettled] = useState(
    () => (fanIds?.length ?? 0) > 0 || peeked != null || fanCount <= 0
  );

  useEffect(() => {
    if (fanIds && fanIds.length > 0) {
      setRoster(fanIds);
      setRosterSettled(true);
    }
  }, [fanIds]);

  useEffect(() => {
    if (roster.length > 0 || fanCount <= 0) {
      setRosterSettled(true);
      return;
    }
    let cancelled = false;
    const cached = peekDropFanIds(creatorId, collectionId);
    if (cached) {
      setRoster(cached);
      setRosterSettled(true);
      return;
    }
    setRosterSettled(false);
    void loadDropFanIds(creatorId, collectionId)
      .then((ids) => {
        if (cancelled) return;
        setRoster(ids);
        setRosterSettled(true);
      })
      .catch(() => {
        if (cancelled) return;
        setRoster([]);
        setRosterSettled(true);
      });
    return () => {
      cancelled = true;
    };
  }, [creatorId, collectionId, fanCount, roster.length]);

  const ids = roster.slice(0, 3);
  const profiles = usePostAuthorProfiles(ids);
  if (ids.length === 0) {
    if (fanCount > 0 && !rosterSettled) {
      return (
        <span className="drops-discovery-deal-fans">
          <GuildFacepile
            memberIds={[]}
            profiles={{}}
            memberCount={fanCount}
            countUnit={{ one: 'fan', other: 'fans' }}
            slots={3}
            loading
            showCount
            className="drops-discovery-fans-facepile"
          />
        </span>
      );
    }
    return (
      <span className="drops-discovery-deal-bit">
        {fanCountLabel(fanCount)}
      </span>
    );
  }
  // Count stays painted while avatars resolve — never shimmer "3 fans" again.
  return (
    <span className="drops-discovery-deal-fans">
      <GuildFacepile
        memberIds={ids}
        profiles={profiles}
        memberCount={fanCount}
        countUnit={{ one: 'fan', other: 'fans' }}
        slots={Math.min(3, ids.length)}
        loading={false}
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
  const fansSheet = useSheetMounted(open);
  const peeked = peekDropFanIds(creatorId, collectionId);
  const [roster, setRoster] = useState<string[]>(
    () => peeked ?? fanIds ?? []
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const label = fanCountLabel(fanCount);

  const warmFans = () => {
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
        <DropRowFans
          creatorId={creatorId}
          collectionId={collectionId}
          fanIds={fanIds}
          fanCount={fanCount}
        />
      </button>
      {fansSheet.mounted ? (
        <ScarceFansSheet
          open={open}
          onClose={() => setOpen(false)}
          onClosed={fansSheet.onClosed}
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

/**
 * Drop face commerce row — same fans control as Drops / market rows.
 * Pending uses DropRowFansPending so lines do not jump when counts land.
 */
export function DropFaceFans({
  creatorId,
  collectionId,
  title,
  fanIds,
  fanCount,
  countsLoading,
}: {
  creatorId: string;
  collectionId: string;
  title: string;
  fanIds?: string[];
  fanCount: number;
  countsLoading: boolean;
}) {
  const hasRoster = (fanIds?.length ?? 0) > 0;
  // First roster only. A refresh must not tear down the painted fans control.
  const rosterPending =
    (fanCount > 0 && !hasRoster) ||
    (countsLoading && fanCount <= 0 && !hasRoster);

  if (rosterPending) {
    return (
      <span className="collection-drop-fans">
        <DropRowFansPending />
      </span>
    );
  }
  if (fanCount <= 0) {
    return (
      <span
        className="collection-drop-fans collection-drop-fans--chassis"
        aria-hidden
      >
        <DropRowFansPending />
      </span>
    );
  }
  return (
    <span className="collection-drop-fans">
      <DropFansButton
        creatorId={creatorId}
        collectionId={collectionId}
        title={title}
        fanIds={fanIds}
        fanCount={fanCount}
      />
    </span>
  );
}
