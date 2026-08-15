'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Divider, StandingIdentity, standingIdentityLabel } from '@onsocial/ui';
import { OsSlideOverScreen } from '@/components/app/os-slide-over-screen';
import { CollectionActivitySkeleton } from '@/features/scarces/collection-page-skeleton';
import {
  doorLogEntryMeta,
  fetchCollectionDoorLog,
  type DoorLogEntry,
} from '@/features/scarces/ticket-door-log';
import type { PassStaffVoice } from '@/features/scarces/ticket-pass-payload';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { portfolioPath } from '@/lib/overlay-routes';

const DOOR_LOG_Z = 90;

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
}: {
  open: boolean;
  onClose: () => void;
  collectionId: string;
  dropTitle: string;
  voice?: PassStaffVoice;
  /** Optional totals line under the title (e.g. `47 of 200 in`). */
  attendanceLine?: string | null;
}) {
  const [sheetOpen, setSheetOpen] = useState(open);
  if (open && !sheetOpen) setSheetOpen(true);

  const requestClose = useCallback(() => {
    setSheetOpen(false);
  }, []);

  const handleClosed = useCallback(() => {
    onClose();
  }, [onClose]);

  const [refreshNonce, setRefreshNonce] = useState(0);
  const requestKey = `${collectionId.trim()}:${refreshNonce}`;
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
  const redeemVoice = voice === 'redeem';
  const title = redeemVoice ? 'Redeem log' : 'Door log';
  const subtitle =
    attendanceLine?.trim() || (dropTitle.trim() ? dropTitle.trim() : undefined);

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
        loaded ? (
          <button
            type="button"
            className="collection-door-log-refresh"
            onClick={() => setRefreshNonce((n) => n + 1)}
          >
            Refresh
          </button>
        ) : null
      }
    >
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
      ) : (
        <div className="standing-list collection-door-log-list">
          {entries.map((entry, index) => {
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
            const meta = doorLogEntryMeta(entry, staffLabel, voice);

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
                      <span className="collection-door-log-meta">{meta}</span>
                    </StandingIdentity>
                  </div>
                  <div className="standing-row-aside">
                    {entry.timeLabel ? (
                      <span className="standing-row-time">
                        {entry.timeLabel}
                      </span>
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
