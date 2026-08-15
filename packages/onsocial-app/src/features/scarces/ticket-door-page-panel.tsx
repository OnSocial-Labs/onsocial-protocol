'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { OsSheetAction, OsSheetActions } from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  fetchCollectionPreferIndexer,
  type CollectionView,
} from '@/features/scarces/collections-data';
import {
  fetchCollectionRedeemAttendance,
  staffAttendanceHeaderSuffix,
  type CollectionRedeemAttendance,
} from '@/features/scarces/ticket-attendance';
import { TicketDoorEventSheet } from '@/features/scarces/ticket-door-event-sheet';
import { TicketDoorWorkbench } from '@/features/scarces/ticket-door-workbench';
import {
  isPassMediumKind,
  passStaffVoice,
  type PassStaffVoice,
} from '@/features/scarces/ticket-pass-payload';
import { fetchIsCollectionRedeemer } from '@/features/scarces/ticket-redeemers';
import { useTicketDoorAdmit } from '@/features/scarces/use-ticket-door-admit';
import { accountIdsEqual } from '@/lib/account-match';
import {
  collectionDoorPath,
  collectionPath,
  collectionRedeemPath,
} from '@/lib/app-routes';

function DoorEmpty({ copy, dropHref }: { copy: ReactNode; dropHref?: string }) {
  return (
    <div className="market-page-empty">
      <p className="market-page-empty-copy">{copy}</p>
      {dropHref ? (
        <Link className="app-soon-link" href={dropHref}>
          Back to drop
        </Link>
      ) : null}
    </div>
  );
}

function DoorFooter({
  stacked,
  children,
}: {
  stacked?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`collection-action-band ticket-door-page-actions${
        stacked ? ' is-stacked' : ''
      }`}
    >
      <div className="commerce-sheet-footer-row">{children}</div>
    </div>
  );
}

/**
 * Staff redeem surface — Door Admit (tickets/memberships) or coupon Redeem.
 * Creator or listed redeemer only; stays open for the next guest after success.
 */
export function TicketDoorPagePanel({
  collectionId,
  initial,
  voice: voiceProp,
}: {
  collectionId: string;
  initial: CollectionView | null;
  /** Route voice; wrong-kind drops redirect to the matching staff page. */
  voice: PassStaffVoice;
}) {
  const router = useRouter();
  const { accountId, isConnected, connect, isLoading } = useAppWallet();
  const [view, setView] = useState<CollectionView | null>(initial);
  const [redeemerCheck, setRedeemerCheck] = useState<{
    key: string;
    ok: boolean;
  } | null>(null);
  const [attendance, setAttendance] =
    useState<CollectionRedeemAttendance | null>(null);
  const [attendanceRefresh, setAttendanceRefresh] = useState(0);
  const [eventOpen, setEventOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchCollectionPreferIndexer(collectionId).then((next) => {
      if (!cancelled && next) setView(next);
    });
    return () => {
      cancelled = true;
    };
  }, [collectionId]);

  const kindVoice = view ? passStaffVoice(view.kind) : voiceProp;

  useEffect(() => {
    if (!view || !isPassMediumKind(view.kind)) return;
    if (kindVoice === voiceProp) return;
    router.replace(
      kindVoice === 'redeem'
        ? collectionRedeemPath(collectionId)
        : collectionDoorPath(collectionId)
    );
  }, [collectionId, kindVoice, router, view, voiceProp]);

  const isOwner =
    Boolean(accountId) &&
    Boolean(view?.creatorId) &&
    accountIdsEqual(accountId!, view!.creatorId);

  const redeemerKey =
    accountId && isPassMediumKind(view?.kind)
      ? `${collectionId}:${accountId}`
      : null;

  useEffect(() => {
    if (!redeemerKey || !accountId) return;
    let cancelled = false;
    void fetchIsCollectionRedeemer(collectionId, accountId).then((ok) => {
      if (!cancelled) setRedeemerCheck({ key: redeemerKey, ok });
    });
    return () => {
      cancelled = true;
    };
  }, [accountId, collectionId, redeemerKey]);

  const isRedeemer =
    redeemerKey != null &&
    redeemerCheck?.key === redeemerKey &&
    redeemerCheck.ok;
  const accessReady = redeemerKey == null || redeemerCheck?.key === redeemerKey;

  const canStaff =
    isPassMediumKind(view?.kind) &&
    (isOwner || isRedeemer) &&
    view?.maxRedeems != null &&
    view.maxRedeems > 0 &&
    kindVoice === voiceProp;

  const doorActive = Boolean(canStaff && accessReady && isConnected);
  const door = useTicketDoorAdmit({
    collectionId,
    active: doorActive,
    afterAdmit: 'ready-next',
    voice: voiceProp,
    onAdmitted: () => {
      setAttendanceRefresh((n) => n + 1);
    },
  });

  useEffect(() => {
    if (!doorActive) return;
    let cancelled = false;
    const load = () => {
      void fetchCollectionRedeemAttendance(collectionId).then((next) => {
        if (!cancelled && next) setAttendance(next);
      });
    };
    load();
    const timer = window.setInterval(load, 12_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [attendanceRefresh, collectionId, doorActive]);

  const eventName = view?.title?.trim() || 'Drop';
  const dropHref = collectionPath(collectionId);
  const redeemVoice = voiceProp === 'redeem';
  const screenTitle = view ? eventName : redeemVoice ? 'Redeem' : 'Admit';
  const attendanceOpts =
    doorActive && attendance && attendance.collectionId === collectionId
      ? {
          voice: voiceProp,
          minted: attendance.minted,
          redeemedCount: attendance.redeemedCount,
          fullyRedeemedCount: attendance.fullyRedeemedCount,
          maxRedeems: attendance.maxRedeems ?? view?.maxRedeems ?? null,
        }
      : null;
  const attendanceSuffix = attendanceOpts
    ? staffAttendanceHeaderSuffix(attendanceOpts)
    : null;
  const screenSubtitle = attendanceSuffix
    ? `${redeemVoice ? 'Redeem' : 'Admit'} · ${attendanceSuffix}`
    : redeemVoice
      ? 'Redeem'
      : 'Admit';

  let body: ReactNode;
  let footer: ReactNode = null;

  if (!view) {
    body = <DoorEmpty copy="Drop not found." dropHref={dropHref} />;
  } else if (
    !isPassMediumKind(view.kind) ||
    view.maxRedeems == null ||
    view.maxRedeems <= 0
  ) {
    body = (
      <DoorEmpty
        copy={
          redeemVoice
            ? 'This drop does not use coupon redeem.'
            : 'This drop does not use Show pass check-in.'
        }
        dropHref={dropHref}
      />
    );
  } else if (kindVoice !== voiceProp) {
    body = <DoorEmpty copy="Opening the right staff page…" />;
  } else if (!isConnected) {
    body = (
      <DoorEmpty
        copy={
          redeemVoice
            ? 'Connect a staff wallet to redeem coupons.'
            : 'Connect a door-staff wallet to admit guests.'
        }
      />
    );
    footer = (
      <DoorFooter>
        <OsSheetActions layout="stack" tone="frosted-primary" borderless>
          <OsSheetAction
            type="button"
            variant="primary"
            ready={!isLoading}
            pending={isLoading}
            pendingLabel="Connecting…"
            disabled={isLoading}
            onClick={() => void connect()}
          >
            Connect wallet
          </OsSheetAction>
        </OsSheetActions>
      </DoorFooter>
    );
  } else if (!accessReady) {
    body = (
      <DoorEmpty
        copy={redeemVoice ? 'Checking redeem access…' : 'Checking door access…'}
      />
    );
  } else if (!canStaff) {
    body = (
      <DoorEmpty
        copy={
          redeemVoice
            ? 'Only the creator or redeem staff can redeem here.'
            : 'Only the creator or door staff can admit here.'
        }
        dropHref={dropHref}
      />
    );
  } else {
    body = (
      <TicketDoorWorkbench
        eventName={eventName}
        videoRef={door.videoRef}
        cameraActive={door.cameraActive}
        cameraError={door.cameraError}
        scanHint={door.scanHint}
        manualInput={door.manualInput}
        setManualInput={door.setManualInput}
        lookupPending={door.lookupPending}
        admitPending={door.admitPending}
        lookupError={door.lookupError}
        setLookupError={door.setLookupError}
        status={door.status}
        lastAdmittedTokenId={door.lastAdmittedTokenId}
        applyLookup={door.applyLookup}
        voice={voiceProp}
        admitConfirmed={door.admitConfirmed}
        canAdmit={door.canAdmit}
      />
    );
    const cameraCta = door.cameraActive
      ? 'Stop camera'
      : door.cameraError
        ? 'Try camera'
        : 'Start camera';
    const primaryReady = door.canAdmit;
    const primaryPending = door.admitPending;
    const primaryLabel = !door.admitConfirmed
      ? 'Confirm'
      : redeemVoice
        ? 'Redeem'
        : 'Admit';
    const primaryPendingLabel = redeemVoice ? 'Redeeming…' : 'Admitting…';
    footer = (
      <DoorFooter stacked>
        <OsSheetActions layout="stack" tone="frosted-primary" borderless>
          <OsSheetAction
            type="button"
            variant="primary"
            ready={primaryReady}
            pending={door.admitConfirmed ? primaryPending : false}
            pendingLabel={primaryPendingLabel}
            disabled={!primaryReady || (door.admitConfirmed && primaryPending)}
            onClick={() => {
              if (!door.admitConfirmed) door.confirmAdmit();
              else void door.handleAdmit();
            }}
          >
            {primaryLabel}
          </OsSheetAction>
          {door.admitConfirmed && door.canAdmit ? (
            <OsSheetAction
              type="button"
              variant="ghost"
              onClick={() => door.clearAdmitConfirm()}
              disabled={door.admitPending}
            >
              Back
            </OsSheetAction>
          ) : (
            <OsSheetAction
              type="button"
              variant="ghost"
              onClick={() => {
                if (door.cameraActive) door.stopCamera();
                else void door.startCamera();
              }}
              disabled={door.admitPending || door.lookupPending}
            >
              {cameraCta}
            </OsSheetAction>
          )}
        </OsSheetActions>
      </DoorFooter>
    );
  }

  return (
    <OsAppScreen
      title={screenTitle}
      subtitle={screenSubtitle}
      backFallbackHref={dropHref}
      glassChrome
      footer={footer}
      actions={
        view && canStaff && accessReady && isConnected ? (
          <button
            type="button"
            className="page-drawer-section-action ticket-door-event-action"
            onClick={() => setEventOpen(true)}
            aria-label={
              redeemVoice ? 'Open event redeem details' : 'Open event door details'
            }
          >
            Event
          </button>
        ) : null
      }
    >
      <div className="market-page ticket-door-page">{body}</div>
      {view && canStaff && accessReady && isConnected ? (
        <TicketDoorEventSheet
          open={eventOpen}
          onClose={() => setEventOpen(false)}
          view={view}
          attendance={attendance}
          voice={voiceProp}
          logRevision={attendanceRefresh}
        />
      ) : null}
    </OsAppScreen>
  );
}
