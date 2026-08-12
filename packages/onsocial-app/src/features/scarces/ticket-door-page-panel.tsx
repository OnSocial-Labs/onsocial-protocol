'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  OsSheetAction,
  OsSheetActions,
  PulsingDots,
} from '@onsocial/ui';
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
  const [isRedeemer, setIsRedeemer] = useState(false);
  const [accessReady, setAccessReady] = useState(false);

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

  useEffect(() => {
    if (!accountId || !isPassMediumKind(view?.kind)) {
      setIsRedeemer(false);
      setAccessReady(true);
      return;
    }
    let cancelled = false;
    setAccessReady(false);
    void fetchIsCollectionRedeemer(collectionId, accountId).then((ok) => {
      if (!cancelled) {
        setIsRedeemer(ok);
        setAccessReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [accountId, collectionId, view?.kind]);

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
    body = (
      <div className="ticket-door-page">
        <p className="ticket-door-page-empty">Drop not found.</p>
        <Link href={dropHref} className="ticket-door-page-back">
          Back to drop
        </Link>
      </div>
    );
  } else if (
    !isPassMediumKind(view.kind) ||
    view.maxRedeems == null ||
    view.maxRedeems <= 0
  ) {
    body = (
      <div className="ticket-door-page">
        <p className="ticket-door-page-empty">
          This drop does not use Show pass check-in.
        </p>
        <Link href={dropHref} className="ticket-door-page-back">
          Back to drop
        </Link>
      </div>
    );
  } else if (!isConnected) {
    body = (
      <div className="ticket-door-page">
        <p className="ticket-door-page-empty">
          Connect a door-staff wallet to admit guests.
        </p>
      </div>
    );
    footer = (
      <OsSheetActions layout="stack" tone="frosted-primary" borderless>
        <OsSheetAction
          type="button"
          variant="primary"
          ready={!isLoading}
          disabled={isLoading}
          onClick={() => void connect()}
        >
          {isLoading ? 'Connecting…' : 'Connect wallet'}
        </OsSheetAction>
      </OsSheetActions>
    );
  } else if (!accessReady) {
    body = (
      <div className="ticket-door-page">
        <p className="ticket-door-page-empty">
          <PulsingDots size="sm" label="Checking door access" />
        </p>
      </div>
    );
  } else if (!canDoor) {
    body = (
      <div className="ticket-door-page">
        <p className="ticket-door-page-empty">
          Only the creator or door staff can admit here.
        </p>
        <Link href={dropHref} className="ticket-door-page-back">
          Back to drop
        </Link>
      </div>
    );
  } else {
    body = (
      <div className="ticket-door-page">
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
      </div>
    );
    footer = (
      <OsSheetActions layout="stack" tone="frosted-primary" borderless>
        <OsSheetAction
          type="button"
          variant="primary"
          ready={door.canAdmit}
          disabled={!door.canAdmit}
          onClick={() => void door.handleAdmit()}
        >
          {door.admitPending ? (
            <PulsingDots size="sm" label="Admitting" />
          ) : (
            'Admit'
          )}
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
      {body}
    </OsAppScreen>
  );
}
