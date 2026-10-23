'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ProfileSocialList } from '@/components/panels/profile-social-list';
import { useDiscoverPanel } from '@/features/discover/discover-panel-context';
import { isDiscoverPeopleSearchActive } from '@/features/discover/discover-omni-search';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import {
  fetchStandingRecommendations,
  filterRecommendedPeek,
} from '@/lib/discover-recommended';
import { filterHiddenAuthors } from '@/lib/viewer-mute-block-filter';
import {
  getGlobalViewerBlockLedgerVersion,
  subscribeGlobalViewerBlockLedger,
} from '@/lib/viewer-block-global';
import {
  getGlobalViewerMuteLedgerVersion,
  subscribeGlobalViewerMuteLedger,
} from '@/lib/viewer-mute-global';
import { getGlobalViewerEndorsementLedger } from '@/lib/viewer-endorsement-global';
import { overlayViewerEndorsedOnAccounts } from '@/lib/viewer-endorsement-ledger';
import { useViewerEndorsement } from '@/hooks/use-viewer-endorsement';
import {
  loadDiscoverFaceTitles,
  withDiscoverFaceLines,
} from '@/lib/discover-face-line';
import { fetchOfferCounts } from '@/lib/profile-offers';
import type { ProfileListAccount } from '@/lib/profile-list-account';

export function DiscoverRecommendedPeek({
  onShownIdsChange,
}: {
  onShownIdsChange?: (accountIds: string[]) => void;
}) {
  const {
    viewerAccountId,
    isConnected,
    query,
    face,
    industry,
    isStandingPendingForTarget,
    handleUpdateStanding,
  } = useDiscoverPanel();
  const { endorsementSyncVersion } = useViewerEndorsement(
    'discover-recommended'
  );
  const [muteBlockSyncVersion, setMuteBlockSyncVersion] = useState(
    () =>
      getGlobalViewerMuteLedgerVersion() + getGlobalViewerBlockLedgerVersion()
  );
  const [hydrated, setHydrated] = useState<{
    viewerId: string;
    rows: ProfileListAccount[];
  } | null>(null);
  const [faceTitles, setFaceTitles] = useState<{
    face: 'offers' | 'hiring';
    titles: Record<string, string>;
  } | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const enabled =
    isConnected &&
    Boolean(viewerAccountId) &&
    !isDiscoverPeopleSearchActive(query);
  const rowsForViewer =
    hydrated && viewerAccountId && hydrated.viewerId === viewerAccountId
      ? hydrated.rows
      : null;

  useEffect(() => {
    const bump = () => {
      setMuteBlockSyncVersion(
        getGlobalViewerMuteLedgerVersion() + getGlobalViewerBlockLedgerVersion()
      );
    };
    const unsubMute = subscribeGlobalViewerMuteLedger(bump);
    const unsubBlock = subscribeGlobalViewerBlockLedger(bump);
    return () => {
      unsubMute();
      unsubBlock();
    };
  }, []);

  useEffect(() => {
    if (!enabled || !viewerAccountId) return;

    let cancelled = false;
    const client = createReadOnlyOnSocialClient();
    void fetchStandingRecommendations(client, viewerAccountId).then((rows) => {
      if (cancelled) return;
      setHydrated({ viewerId: viewerAccountId, rows });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, viewerAccountId]);

  const visible = useMemo(() => {
    void endorsementSyncVersion;
    void muteBlockSyncVersion;
    if (!enabled || rowsForViewer == null) return [];
    return filterRecommendedPeek(
      overlayViewerEndorsedOnAccounts(
        filterHiddenAuthors(rowsForViewer),
        getGlobalViewerEndorsementLedger()
      ),
      face,
      industry
    );
  }, [
    enabled,
    endorsementSyncVersion,
    face,
    industry,
    muteBlockSyncVersion,
    rowsForViewer,
  ]);
  const directoryLine = face === 'offers' || face === 'hiring' ? face : null;
  const offerAccountKey =
    directoryLine == null
      ? ''
      : visible
          .filter((account) => account.offerCount == null)
          .map((account) => account.accountId)
          .slice(0, 40)
          .join(',');
  const [offerCounts, setOfferCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    const ids = offerAccountKey ? offerAccountKey.split(',') : [];
    if (ids.length === 0) return;
    const controller = new AbortController();
    void fetchOfferCounts(ids, controller.signal)
      .then((counts) => {
        if (!controller.signal.aborted) setOfferCounts(counts);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [offerAccountKey]);
  const counted = useMemo(() => {
    if (!directoryLine) return visible;
    return visible.map((account) => {
      if (account.offerCount != null) return account;
      const offerCount = offerCounts[account.accountId];
      return offerCount ? { ...account, offerCount } : account;
    });
  }, [directoryLine, offerCounts, visible]);
  const listed = useMemo(() => {
    if (!directoryLine) return counted;
    const titles = faceTitles?.face === directoryLine ? faceTitles.titles : {};
    return withDiscoverFaceLines(counted, titles, directoryLine);
  }, [counted, directoryLine, faceTitles]);

  useEffect(() => {
    if (!directoryLine || visible.length === 0) return;
    let cancelled = false;
    const client = createReadOnlyOnSocialClient();
    void loadDiscoverFaceTitles(
      client,
      visible.map((row) => row.accountId),
      directoryLine
    )
      .then((titles) => {
        if (!cancelled) setFaceTitles({ face: directoryLine, titles });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [directoryLine, visible]);

  useEffect(() => {
    onShownIdsChange?.(listed.map((row) => row.accountId));
    return () => {
      onShownIdsChange?.([]);
    };
  }, [listed, onShownIdsChange]);

  // Pending / empty — never reserve flow (chrome spacing contract).
  if (!enabled || rowsForViewer == null || listed.length === 0) return null;
  return (
    <section
      className="discover-trending-section discover-recommended-peek"
      aria-label="Recommended"
    >
      <div className="discover-trending-section-head">
        <h2 className="discover-trending-heading">Recommended</h2>
      </div>
      <ProfileSocialList
        accounts={listed}
        listKey={`discover-recommended:${face}:${industry || '__any__'}`}
        viewerAccountId={viewerAccountId}
        showSolidarityBadge
        standingTimeMode="viewer-only"
        skeletonRowVariant="discover"
        viewerRelationshipsLoading={false}
        canUpdateStandingFor={(account) =>
          isConnected &&
          Boolean(viewerAccountId) &&
          viewerAccountId !== account.accountId
        }
        isPendingFor={isStandingPendingForTarget}
        onUpdateStanding={(account, shouldStand) => {
          if (!viewerAccountId || viewerAccountId === account.accountId) {
            return;
          }
          if (shouldStand) {
            setHydrated((current) =>
              current == null
                ? current
                : {
                    viewerId: current.viewerId,
                    rows: current.rows.filter(
                      (row) => row.accountId !== account.accountId
                    ),
                  }
            );
          }
          void handleUpdateStanding(account, shouldStand);
        }}
        loadMoreSentinelRef={loadMoreRef}
        footerSummary={null}
        isLoadingMore={false}
        showLoadMoreSentinel={false}
        directoryLine={directoryLine ?? undefined}
      />
    </section>
  );
}
