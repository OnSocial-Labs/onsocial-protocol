'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { OsSheetAction, OsSheetActions } from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  fetchCollectionPreferIndexer,
  type CollectionView,
} from '@/features/scarces/collections-data';
import { TicketDoorWorkbench } from '@/features/scarces/ticket-door-workbench';
import { isPassMediumKind } from '@/features/scarces/ticket-pass-payload';
import { fetchIsCollectionRedeemer } from '@/features/scarces/ticket-redeemers';
import { useTicketDoorAdmit } from '@/features/scarces/use-ticket-door-admit';
import { accountIdsEqual } from '@/lib/account-match';
import { collectionPath } from '@/lib/app-routes';

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
 * Fullscreen Door Admit — browser camera for event staff.
 * Creator or listed redeemer only; stays open for the next guest after admit.
 */
export function TicketDoorPagePanel({
  collectionId,
  initial,
}: {
  collectionId: string;
  initial: CollectionView | null;
}) {
  const { accountId, isConnected, connect, isLoading } = useAppWallet();
  const [view, setView] = useState<CollectionView | null>(initial);
  const [redeemerCheck, setRedeemerCheck] = useState<{
    key: string;
    ok: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchCollectionPreferIndexer(collectionId).then((next) => {
      if (!cancelled && next) setView(next);
    });
    return () => {
      cancelled = true;
    };
  }, [collectionId]);

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

  const canDoor =
    isPassMediumKind(view?.kind) &&
    (isOwner || isRedeemer) &&
    view?.maxRedeems != null &&
    view.maxRedeems > 0;

  const doorActive = Boolean(canDoor && accessReady && isConnected);
  const door = useTicketDoorAdmit({
    collectionId,
    active: doorActive,
    afterAdmit: 'ready-next',
  });

  const eventName = view?.title?.trim() || 'Drop';
  const dropHref = collectionPath(collectionId);
  const screenTitle = view ? eventName : 'Admit';

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
        copy="This drop does not use Show pass check-in."
        dropHref={dropHref}
      />
    );
  } else if (!isConnected) {
    body = (
      <DoorEmpty copy="Connect a door-staff wallet to admit guests." />
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
    body = <DoorEmpty copy="Checking door access…" />;
  } else if (!canDoor) {
    body = (
      <DoorEmpty
        copy="Only the creator or door staff can admit here."
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
        lead="Point at a Show pass QR. After admit, stay here for the next guest."
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
            pendingLabel="Admitting…"
            disabled={!door.canAdmit}
            onClick={() => void door.handleAdmit()}
          >
            Admit
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
      subtitle="Admit"
      backFallbackHref={dropHref}
      glassChrome
      footer={footer}
    >
      <div className="market-page ticket-door-page">{body}</div>
    </OsAppScreen>
  );
}
