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
import { ticketEventPlaceLabel } from '@/features/scarces/ticket-event-meta';
import {
  formatFutureRelativeTime,
  formatMarketRelativeTime,
} from '@/features/market/market-listings';
import { collectionPath } from '@/lib/app-routes';
import { formatPageDrawerJoinedFullLabel } from '@/lib/page-drawer-meta';

function saleScheduleLines(
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
    next = rel ? `Sale opens ${rel}` : null;
  } else if (status === 'live' && view.endTimeMs) {
    const rel = formatFutureRelativeTime(view.endTimeMs, nowMs);
    next = rel ? `Sale closes ${rel}` : null;
  } else if (status === 'ended' && view.endTimeMs) {
    const rel = formatMarketRelativeTime(view.endTimeMs, nowMs);
    next = rel ? `Sale closed ${rel}` : null;
  }

  return {
    opens,
    closes,
    closesLabel: status === 'ended' ? 'Closed' : 'Closes',
    next,
  };
}

function eventScheduleLines(
  view: CollectionView,
  nowMs: number
): {
  starts: string | null;
  ends: string | null;
  next: string | null;
} {
  const starts =
    view.eventStartsAtMs != null
      ? formatPageDrawerJoinedFullLabel(view.eventStartsAtMs)
      : null;
  const ends =
    view.eventEndsAtMs != null
      ? formatPageDrawerJoinedFullLabel(view.eventEndsAtMs)
      : null;

  let next: string | null = null;
  if (view.eventStartsAtMs != null && view.eventStartsAtMs > nowMs) {
    const rel = formatFutureRelativeTime(view.eventStartsAtMs, nowMs);
    next = rel ? `Starts ${rel}` : null;
  } else if (view.eventEndsAtMs != null && view.eventEndsAtMs > nowMs) {
    const rel = formatFutureRelativeTime(view.eventEndsAtMs, nowMs);
    next = rel ? `Ends ${rel}` : null;
  } else if (view.eventEndsAtMs != null && view.eventEndsAtMs <= nowMs) {
    const rel = formatMarketRelativeTime(view.eventEndsAtMs, nowMs);
    next = rel ? `Ended ${rel}` : null;
  }

  return { starts, ends, next };
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
  const [closing, setClosing] = useState(false);
  const sheetOpen = open && !closing;
  const [doorLogOpen, setDoorLogOpen] = useState(false);

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
  }, [closing]);

  const handleClosed = useCallback(() => {
    setClosing(false);
    setDoorLogOpen(false);
    onClose();
  }, [onClose]);

  const [nowMs] = useState(() => Date.now());
  const sale = saleScheduleLines(view, nowMs);
  const event = eventScheduleLines(view, nowMs);
  const status = deriveCollectionStatus(view, nowMs);
  const placeLabel = ticketEventPlaceLabel(view.place);
  const hasEvent =
    Boolean(event.starts) || Boolean(event.ends) || Boolean(placeLabel);
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

          {hasEvent ? (
            <SheetFactSection title="Event">
              {placeLabel ? (
                <SheetFactRow label="Place" value={placeLabel} />
              ) : null}
              {event.starts ? (
                <SheetFactRow label="Starts" value={event.starts} />
              ) : null}
              {event.ends ? (
                <SheetFactRow label="Ends" value={event.ends} />
              ) : null}
              {event.next ? <SheetFactCopy>{event.next}</SheetFactCopy> : null}
            </SheetFactSection>
          ) : null}

          <SheetFactSection title="Sale">
            <SheetFactRow
              label="Status"
              value={collectionStatusLabel(status)}
            />
            {sale.opens ? (
              <SheetFactRow label="Opens" value={sale.opens} />
            ) : null}
            {sale.closes ? (
              <SheetFactRow label={sale.closesLabel} value={sale.closes} />
            ) : null}
            {!sale.opens && !sale.closes ? (
              <SheetFactRow label="Window" value="Open until sold out" />
            ) : null}
            {sale.next ? <SheetFactCopy>{sale.next}</SheetFactCopy> : null}
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
