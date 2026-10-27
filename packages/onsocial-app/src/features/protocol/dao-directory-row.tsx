'use client';

import { useMemo, useRef } from 'react';
import { CommunityDiscoverRow } from '@/components/community-cards';
import type { DaoDirectoryEntry } from '@/features/protocol/dao-directory';
import { SECONDARY_ANCHOR_QUERY } from '@/features/home/home-feed-scroll-anchor';
import { useFeedWindow } from '@/features/home/use-feed-window';
import { displayName } from '@/lib/profile-display';

/** Discover / search DAO row — banner + square crest before name. */
export function DaoDirectoryRow({ entry }: { entry: DaoDirectoryEntry }) {
  const title = displayName(entry.accountId, entry.name);
  const description = entry.subtitle.trim() || null;

  return (
    <CommunityDiscoverRow
      href={entry.href}
      seedId={entry.accountId}
      bannerUrl={entry.bannerUrl}
      markUrl={entry.avatarUrl}
      markVariant="crest"
      title={title}
      description={description}
      ariaLabel={title}
      meta={
        <>
          <span className="community-summary-stat">
            <span className="community-summary-stat-label">
              @{entry.accountId}
            </span>
          </span>
          <span className="guild-card-pill guild-card-pill--topic">
            {entry.kindLabel}
          </span>
        </>
      }
    />
  );
}

export function DaoDirectoryList({
  entries,
  empty,
}: {
  entries: DaoDirectoryEntry[];
  empty?: string | null;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const keys = useMemo(
    () => entries.map((entry) => entry.accountId),
    [entries]
  );
  const { windowed, start, end, topSpacer, bottomSpacer, registerRow } =
    useFeedWindow({
      keys,
      hostRef,
      anchorQuery: SECONDARY_ANCHOR_QUERY,
      estimate: 112,
    });

  if (entries.length === 0) {
    return empty ? <p className="launcher-home-empty">{empty}</p> : null;
  }

  return (
    <div
      ref={hostRef}
      className="community-summary-card-grid dao-directory-list"
      role="list"
    >
      {windowed && topSpacer > 0 ? (
        <div
          style={{ height: topSpacer }}
          aria-hidden="true"
          data-feed-window-spacer="top"
        />
      ) : null}
      {entries.slice(start, end).map((entry) => (
        <div
          key={entry.accountId}
          role="listitem"
          ref={registerRow(entry.accountId)}
          data-secondary-key={entry.accountId}
        >
          <DaoDirectoryRow entry={entry} />
        </div>
      ))}
      {windowed && bottomSpacer > 0 ? (
        <div
          style={{ height: bottomSpacer }}
          aria-hidden="true"
          data-feed-window-spacer="bottom"
        />
      ) : null}
    </div>
  );
}
