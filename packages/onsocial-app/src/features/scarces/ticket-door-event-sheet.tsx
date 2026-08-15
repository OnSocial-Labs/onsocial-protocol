'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import {
  OsHugSheet,
  SheetFactCopy,
  SheetFactRow,
  SheetFactSection,
} from '@onsocial/ui';
import {
  collectionStatusLabel,
  deriveCollectionStatus,
  type CollectionView,
} from '@/features/scarces/collections-data';
import { type CollectionRedeemAttendance } from '@/features/scarces/ticket-attendance';
import { CollectionDoorLogSheet } from '@/features/scarces/collection-door-log-sheet';
import type { PassStaffVoice } from '@/features/scarces/ticket-pass-payload';
import {
  formatFutureRelativeTime,
  formatMarketRelativeTime,
} from '@/features/market/market-listings';
import { collectionPath } from '@/lib/app-routes';
import { formatPageDrawerJoinedFullLabel } from '@/lib/page-drawer-meta';

function scheduleLines(
  view: CollectionView,
  nowMs: number
): {
  opens: string | null;
  closes: string | null;
  closesLabel: 'Closes' | 'Closed';
  next: string | null;
} {
  const status = deriveCollectionStatus(view, nowMs);
  const opens =
    view.startTimeMs != null
      ? formatPageDrawerJoinedFullLabel(view.startTimeMs)
      : null;
  const closes =
    view.endTimeMs != null
      ? formatPageDrawerJoinedFullLabel(view.endTimeMs)
      : null;

  let next: string | null = null;
  if (status === 'upcoming' && view.startTimeMs) {
    const rel = formatFutureRelativeTime(view.startTimeMs, nowMs);
    next = rel ? `Opens ${rel}` : null;
  } else if (status === 'live' && view.endTimeMs) {
    const rel = formatFutureRelativeTime(view.endTimeMs, nowMs);
    next = rel ? `Closes ${rel}` : null;
  } else if (status === 'ended' && view.endTimeMs) {
    const rel = formatMarketRelativeTime(view.endTimeMs, nowMs);
    next = rel ? `Closed ${rel}` : null;
  }

  return {
    opens,
    closes,
    closesLabel: status === 'ended' ? 'Closed' : 'Closes',
    next,
  };
}

/**
 * Compact Event drawer for Door Admit / Redeem — live attendance + schedule.
 */
export function TicketDoorEventSheet({
  open,
  onClose,
  view,
  attendance,
  voice,
  logRevision = 0,
}: {
  open: boolean;
  onClose: () => void;
  view: CollectionView;
  attendance: CollectionRedeemAttendance | null;
  voice: PassStaffVoice;
  /** Bump after admit so Door log refetches. */
  logRevision?: number;
}) {
  const [sheetOpen, setSheetOpen] = useState(open);
  if (open && !sheetOpen) setSheetOpen(true);
  const [doorLogOpen, setDoorLogOpen] = useState(false);

  const requestClose = useCallback(() => {
    setSheetOpen(false);
  }, []);

  const handleClosed = useCallback(() => {
    onClose();
  }, [onClose]);

  const [nowMs] = useState(() => Date.now());
  const schedule = scheduleLines(view, nowMs);
  const status = deriveCollectionStatus(view, nowMs);
  const maxRedeems = attendance?.maxRedeems ?? view.maxRedeems;
  const redeemVoice = voice === 'redeem';
  const perPass =
    maxRedeems != null && maxRedeems > 0
      ? maxRedeems === 1
        ? redeemVoice
          ? '1 redeem'
          : '1 check-in'
        : redeemVoice
          ? `${maxRedeems} redeems`
          : `${maxRedeems} check-ins`
      : null;
  const minted = attendance?.minted ?? view.minted;
  const supply = attendance?.totalSupply || view.totalSupply;
  const dropHref = collectionPath(view.collectionId);
  const attendanceSuffix =
    attendance && attendance.collectionId === view.collectionId
      ? redeemVoice
        ? `${Math.min(attendance.minted, attendance.fullyRedeemedCount)} of ${attendance.minted} redeemed`
        : `${Math.min(attendance.minted, attendance.fullyRedeemedCount)} of ${attendance.minted} in`
      : null;

  return (
    <>
      <OsHugSheet
        open={sheetOpen}
        onClose={requestClose}
        onClosed={handleClosed}
        label="Event"
        copy={view.title}
        closeAriaLabel="Close event"
        backdropLabel="Close event"
        zIndex={57}
        panelClassName="guild-facts-sheet-panel"
        bodyClassName="guild-facts-sheet-body"
      >
        <div className="guild-facts">
          <SheetFactSection title={redeemVoice ? 'Tonight' : 'Door'}>
            {attendance && attendance.collectionId === view.collectionId ? (
              <>
                <SheetFactRow
                  label={redeemVoice ? 'Redeemed' : 'Checked in'}
                  value={`${Math.min(attendance.minted, attendance.fullyRedeemedCount)} of ${attendance.minted}`}
                />
                {maxRedeems != null && maxRedeems > 1 ? (
                  <SheetFactRow
                    label={redeemVoice ? 'Redeems' : 'Check-ins'}
                    value={`${attendance.redeemedCount} total`}
                  />
                ) : null}
              </>
            ) : (
              <SheetFactRow
                label={redeemVoice ? 'Redeemed' : 'Checked in'}
                value="…"
              />
            )}
            {perPass ? (
              <SheetFactRow
                label={redeemVoice ? 'Per coupon' : 'Per pass'}
                value={perPass}
              />
            ) : null}
            <SheetFactRow
              label="Minted"
              value={supply > 0 ? `${minted} / ${supply}` : `${minted} minted`}
            />
            <SheetFactRow
              label={redeemVoice ? 'Redeem log' : 'Door log'}
              value={
                <button
                  type="button"
                  className="guild-facts-link"
                  onClick={() => setDoorLogOpen(true)}
                >
                  See who
                </button>
              }
            />
          </SheetFactSection>

          <SheetFactSection title="Drop">
            <SheetFactRow
              label="Status"
              value={collectionStatusLabel(status)}
            />
            {schedule.opens ? (
              <SheetFactRow label="Opens" value={schedule.opens} />
            ) : null}
            {schedule.closes ? (
              <SheetFactRow
                label={schedule.closesLabel}
                value={schedule.closes}
              />
            ) : null}
            {!schedule.opens && !schedule.closes ? (
              <SheetFactRow label="Schedule" value="No timed window" />
            ) : null}
            {schedule.next ? (
              <SheetFactCopy>{schedule.next}</SheetFactCopy>
            ) : null}
            <SheetFactRow
              label="Drop"
              value={
                <Link
                  href={dropHref}
                  className="guild-facts-link"
                  scroll={false}
                >
                  View drop
                </Link>
              }
            />
          </SheetFactSection>
        </div>
      </OsHugSheet>

      <CollectionDoorLogSheet
        open={doorLogOpen}
        onClose={() => setDoorLogOpen(false)}
        collectionId={view.collectionId}
        dropTitle={view.title}
        voice={voice}
        attendanceLine={attendanceSuffix}
        revision={logRevision}
      />
    </>
  );
}
