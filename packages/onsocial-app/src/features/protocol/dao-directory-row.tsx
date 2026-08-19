'use client';

import Link from 'next/link';
import { Divider, StandingIdentity } from '@onsocial/ui';
import type { DaoDirectoryEntry } from '@/features/protocol/dao-directory';

/** Standing-style DAO row with square/squircle crest. */
export function DaoDirectoryRow({
  entry,
  showDivider = true,
}: {
  entry: DaoDirectoryEntry;
  showDivider?: boolean;
}) {
  const named = entry.name.trim().toLowerCase() !== entry.accountId;
  return (
    <>
      <div className="standing-row dao-directory-row">
        <div className="standing-row-main">
          <Link
            href={entry.href}
            className="standing-row-hit"
            aria-label={named ? entry.name : `@${entry.accountId}`}
          />
          <StandingIdentity
            accountId={entry.accountId}
            profileName={named ? entry.name : null}
            avatarUrl={entry.avatarUrl}
            size="lg"
            showHandle="when-named"
            avatarClassName="standing-row-avatar-slot dao-directory-crest"
          >
            <span className="standing-row-bio dao-directory-meta">
              {entry.subtitle}
            </span>
          </StandingIdentity>
        </div>
        <div className="standing-row-aside dao-directory-aside">
          <span className="dao-directory-kind">{entry.kindLabel}</span>
        </div>
      </div>
      {showDivider ? <Divider /> : null}
    </>
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
    <div className="dao-directory-list" role="list">
      {entries.map((entry, index) => (
        <div key={entry.accountId} role="listitem">
          <DaoDirectoryRow
            entry={entry}
            showDivider={index < entries.length - 1}
          />
        </div>
      ))}
    </div>
  );
}
