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
  staffAttendanceLine,
  type CollectionRedeemAttendance,
} from '@/features/scarces/ticket-attendance';
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

function DoorEmpty({
  copy,
  dropHref,
}: {
  copy: ReactNode;
  dropHref?: string;
}) {
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
  const accessReady =
    redeemerKey == null || redeemerCheck?.key === redeemerKey;

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
      setAttendanceTick((n) => n + 1);
    },
  });

  useEffect(() => {
    if (!doorActive) {
      setAttendance(null);
      return;
    }
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
  }, [attendanceTick, collectionId, doorActive]);

  const eventName = view?.title?.trim() || 'Drop';
  const dropHref = collectionPath(collectionId);
  const redeemVoice = voiceProp === 'redeem';
  const screenSubtitle = redeemVoice ? 'Redeem' : 'Admit';
  const screenTitle = view ? eventName : screenSubtitle;
  const attendanceLine = attendance
    ? staffAttendanceLine({
        voice: voiceProp,
        minted: attendance.minted,
        redeemedCount: attendance.redeemedCount,
        fullyRedeemedCount: attendance.fullyRedeemedCount,
        maxRedeems: attendance.maxRedeems ?? view?.maxRedeems ?? null,
      })
    : null;

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
        copy={
          redeemVoice ? 'Checking redeem access…' : 'Checking door access…'
        }
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
        attendanceLine={attendanceLine}
        lead={
          redeemVoice
            ? 'Point at a coupon QR. After redeem, stay here for the next guest.'
            : 'Point at a Show pass QR. After admit, stay here for the next guest.'
        }
      />
    );
    footer = (
      <DoorFooter stacked>
        <OsSheetActions layout="stack" tone="frosted-primary" borderless>
          <OsSheetAction
            type="button"
            variant="primary"
            ready={door.canAdmit}
            pending={door.admitPending}
            pendingLabel={redeemVoice ? 'Redeeming…' : 'Admitting…'}
            disabled={!door.canAdmit}
            onClick={() => void door.handleAdmit()}
          >
            {redeemVoice ? 'Redeem' : 'Admit'}
          </OsSheetAction>
          <OsSheetAction
            type="button"
            variant="ghost"
            onClick={() => {
              if (door.cameraActive) door.stopCamera();
              else void door.startCamera();
            }}
            disabled={door.admitPending || door.lookupPending}
          >
            {door.cameraActive ? 'Stop camera' : 'Scan again'}
          </OsSheetAction>
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
    >
      <div className="market-page ticket-door-page">{body}</div>
    </OsAppScreen>
  );
}
