'use client';

import { CommunityDiscoverRow } from '@/components/community-cards';
import type { DaoDirectoryEntry } from '@/features/protocol/dao-directory';

/** Discover / search DAO row — banner + square crest before name. */
export function DaoDirectoryRow({
  entry,
}: {
  entry: DaoDirectoryEntry;
  /** @deprecated Dividers unused — standing list gap matches guild cards. */
  showDivider?: boolean;
}) {
  const named = entry.name.trim().toLowerCase() !== entry.accountId;
  const title = named ? entry.name : entry.accountId;
  const description = entry.subtitle.trim() || null;

  return (
    <CommunityDiscoverRow
      href={entry.href}
      seedId={entry.accountId}
      bannerUrl={entry.bannerUrl}
      markUrl={entry.avatarUrl}
      markVariant="crest"
      reserveMark
      title={title}
      description={description}
      ariaLabel={named ? entry.name : `@${entry.accountId}`}
      meta={
        <>
          {named ? (
            <span className="guild-summary-card-stat">
              <span className="guild-summary-card-stat-label">
                @{entry.accountId}
              </span>
            </span>
          ) : null}
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
  if (entries.length === 0) {
    return empty ? <p className="launcher-home-empty">{empty}</p> : null;
  }

  return (
    <div className="guild-summary-card-grid dao-directory-list" role="list">
      {entries.map((entry) => (
        <div key={entry.accountId} role="listitem">
          <DaoDirectoryRow entry={entry} />
        </div>
      ))}
    </div>
  );
}
