'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Divider,
  OsIconAction,
  RefreshIcon,
  SearchField,
  standingIdentityLabel,
} from '@onsocial/ui';
import { StandingIdentity } from '@/components/profile/standing-identity';
import { OsSlideOverScreen } from '@/components/app/os-slide-over-screen';
import { CollectionActivitySkeleton } from '@/features/scarces/collection-page-skeleton';
import {
  doorLogEntryIso,
  doorLogEntrySeatLine,
  doorLogStaffVerb,
  fetchCollectionDoorLog,
  filterDoorLogEntries,
  type DoorLogEntry,
} from '@/features/scarces/ticket-door-log';
import type { PassStaffVoice } from '@/features/scarces/ticket-pass-payload';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { portfolioPath } from '@/lib/overlay-routes';
import { SHEET_Z } from '@/lib/sheet-z';

const DOOR_LOG_Z = SHEET_Z.overShell;

/**
 * Organizer Door log — OsSlideOverScreen list of who was admitted,
 * by which staff, and when (newest first).
 */
export function CollectionDoorLogSheet({
  open,
  onClose,
  collectionId,
  dropTitle,
  voice = 'admit',
  attendanceLine = null,
  /** Bump after a successful admit so an open log (or next open) refetches. */
  revision = 0,
}: {
  open: boolean;
  onClose: () => void;
  collectionId: string;
  dropTitle: string;
  voice?: PassStaffVoice;
  /** Optional totals line under the title (e.g. `47 of 200 in`). */
  attendanceLine?: string | null;
  revision?: number;
}) {
  const [sheetOpen, setSheetOpen] = useState(open);
  if (open && !sheetOpen) setSheetOpen(true);

  const [refreshNonce, setRefreshNonce] = useState(0);
  const [query, setQuery] = useState('');

  const requestClose = useCallback(() => {
    setSheetOpen(false);
  }, []);

  const handleClosed = useCallback(() => {
    setQuery('');
    onClose();
  }, [onClose]);

  const requestKey = `${collectionId.trim()}:${refreshNonce}:${revision}`;
  const [fetched, setFetched] = useState<{
    key: string;
    entries: DoorLogEntry[];
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!sheetOpen) return;
    let cancelled = false;
    const key = requestKey;
    void fetchCollectionDoorLog(collectionId)
      .then((next) => {
        if (cancelled) return;
        setFetched({ key, entries: next, error: null });
      })
      .catch(() => {
        if (cancelled) return;
        setFetched({
          key,
          entries: [],
          error:
            voice === 'redeem'
              ? 'Could not load redeem history.'
              : 'Could not load door log.',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [collectionId, requestKey, sheetOpen, voice]);

  const loaded = fetched?.key === requestKey;
  const entries = loaded ? fetched.entries : null;
  const loadError = loaded ? fetched.error : null;

  const accountIds = useMemo(() => {
    if (!entries?.length) return [] as string[];
    const ids = new Set<string>();
    for (const entry of entries) {
      ids.add(entry.guestId);
      ids.add(entry.staffId);
    }
    return [...ids];
  }, [entries]);

  const profiles = usePostAuthorProfiles(accountIds);

  const nameByAccount = useMemo(() => {
    const map: Record<string, string | null | undefined> = {};
    for (const id of accountIds) {
      map[id] = profiles[id]?.displayName ?? null;
    }
    return map;
  }, [accountIds, profiles]);

  const visible = useMemo(
    () => (entries ? filterDoorLogEntries(entries, query, nameByAccount) : []),
    [entries, nameByAccount, query]
  );

  const redeemVoice = voice === 'redeem';
  const title = redeemVoice ? 'Redeem log' : 'Door log';
  const subtitle =
    attendanceLine?.trim() || (dropTitle.trim() ? dropTitle.trim() : undefined);
  const staffVerb = doorLogStaffVerb(voice);

  return (
    <OsSlideOverScreen
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      title={title}
      subtitle={subtitle}
      closeAriaLabel={
        redeemVoice ? 'Back from redeem log' : 'Back from door log'
      }
      zIndex={DOOR_LOG_Z}
      className="collection-door-log-slide"
      contentClassName="collection-door-log"
      actions={
        <OsIconAction
          ariaLabel={redeemVoice ? 'Refresh redeem log' : 'Refresh door log'}
          disabled={!loaded}
          onClick={() => setRefreshNonce((n) => n + 1)}
        >
          <RefreshIcon aria-hidden className="glass-sheet-close-icon" />
        </OsIconAction>
      }
    >
      <SearchField
        value={query}
        onValueChange={setQuery}
        placeholder="Search guest, staff, or pass"
        ariaLabel={redeemVoice ? 'Search redeem log' : 'Search door log'}
        clearAriaLabel={
          redeemVoice ? 'Clear redeem log search' : 'Clear door log search'
        }
        chrome="sheet"
        className="collection-door-log-search"
      />

      {loadError ? (
        <p className="ticket-door-error" role="alert">
          {loadError}
        </p>
      ) : null}

      {!loaded || entries == null ? (
        <CollectionActivitySkeleton rows={6} />
      ) : entries.length === 0 ? (
        <p className="collection-door-log-empty">
          {redeemVoice
            ? 'No redeems yet. Codes scanned at the counter show up here.'
            : 'No check-ins yet. Passes admitted at the door show up here.'}
        </p>
      ) : visible.length === 0 ? (
        <p className="collection-door-log-empty">No matches.</p>
      ) : (
        <div className="standing-list collection-door-log-list">
          {visible.map((entry, index) => {
            const guestProfile = profiles[entry.guestId];
            const staffProfile = profiles[entry.staffId];
            const guestLabel = standingIdentityLabel(
              entry.guestId,
              guestProfile?.displayName
            ).label;
            const staffLabel = standingIdentityLabel(
              entry.staffId,
              staffProfile?.displayName
            ).label;
            const seatLine = doorLogEntrySeatLine(entry);
            const timeIso = doorLogEntryIso(entry.blockTimestamp);

            return (
              <div key={entry.key}>
                {index > 0 ? <Divider variant="item" /> : null}
                <div className="standing-row collection-door-log-row">
                  <div className="standing-row-main">
                    <Link
                      href={portfolioPath(entry.guestId)}
                      className="standing-row-hit"
                      scroll={false}
                      aria-label={`View ${guestLabel}'s profile`}
                    />
                    <StandingIdentity
                      accountId={entry.guestId}
                      profileName={guestProfile?.displayName}
                      avatarUrl={guestProfile?.avatarUrl}
                    >
                      <span className="collection-door-log-meta">
                        <span className="collection-door-log-seat">
                          {seatLine}
                        </span>
                        <span className="collection-door-log-staff-line">
                          {staffVerb}{' '}
                          <Link
                            href={portfolioPath(entry.staffId)}
                            className="collection-door-log-staff"
                            scroll={false}
                            aria-label={`View ${staffLabel}'s profile`}
                            onClick={(event) => event.stopPropagation()}
                          >
                            {staffLabel}
                          </Link>
                        </span>
                      </span>
                    </StandingIdentity>
                  </div>
                  <div className="standing-row-aside collection-door-log-aside">
                    {entry.timeAbsolute || entry.timeLabel ? (
                      <time dateTime={timeIso} title={entry.timeAbsolute || undefined}>
                        {entry.timeAbsolute ? (
                          <span className="collection-door-log-absolute">
                            {entry.timeAbsolute}
                          </span>
                        ) : null}
                        {entry.timeLabel ? (
                          <span className="standing-row-time">
                            {entry.timeLabel}
                          </span>
                        ) : null}
                      </time>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </OsSlideOverScreen>
  );
}
