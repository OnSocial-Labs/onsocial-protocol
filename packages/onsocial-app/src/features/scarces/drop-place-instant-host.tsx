'use client';

import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { usePathname } from 'next/navigation';
import { useArmOsInAppScreen } from '@/components/providers/os-face-leave-provider';
import { CollectionPagePanel } from '@/features/scarces/collection-page-panel';
import type { CollectionCreatorFace } from '@/features/scarces/collection-creator-face';
import type { CollectionView } from '@/features/scarces/collections-data';
import type { CollectionActivityRow } from '@/features/scarces/collection-activity-rows';
import {
  clearDropPlaceInstant,
  commitDropPlaceInstant,
  getDropPlaceInstant,
  getDropPlaceInstantServer,
  instantDropFirstPaint,
  instantHostOwns,
  subscribeDropPlaceInstant,
} from '@/features/scarces/drop-place-instant';
import { useDropPlaceOpen } from '@/features/scarces/drop-place-open';
import { collectionPath } from '@/lib/app-routes';
import { SHEET_Z } from '@/lib/sheet-z';

type E2EWindow = Window & {
  __osOpenUncachedDrop?: (collectionId: string) => void;
};

/**
 * One panel for the whole open. The seed is read on the first commit;
 * catalog soft-fill updates that same instance. A new collection id remounts.
 */
const DropPlaceInstantPanel = memo(function DropPlaceInstantPanel({
  collectionId,
  editionToken,
}: {
  collectionId: string;
  editionToken: string | null;
}) {
  const [seed] = useState(() => instantDropFirstPaint(collectionId));
  return (
    <CollectionPagePanel
      collectionId={collectionId}
      initial={seed.view}
      initialCreator={seed.creator}
      initialEditionToken={editionToken}
    />
  );
});

export type CollectionRouteSlotProps = {
  collectionId: string;
  initial: CollectionView | null;
  initialCreator?: CollectionCreatorFace | null;
  initialActivity?: CollectionActivityRow[];
  initialViewerAccountId?: string | null;
  initialHoldSeed?: { holds: boolean; tokenId: string | null } | null;
  initialEditionToken?: string | null;
  /**
   * Client navigations pass true so this slot's server render is empty.
   * The flight still carries these props. The host paints until it is
   * cleared; back/forward then renders this slot.
   */
  yieldToHost?: boolean;
};

/**
 * Route paint. Yields while the host already has this drop (one panel).
 * Otherwise this is the panel: hard refresh, and a cached flight on
 * back/forward after the host has cleared.
 */
export function CollectionRouteSlot({
  yieldToHost = false,
  ...props
}: CollectionRouteSlotProps) {
  const armed = useSyncExternalStore(
    subscribeDropPlaceInstant,
    () => instantHostOwns(props.collectionId),
    () => yieldToHost
  );
  if (armed) return null;
  return <CollectionPagePanel {...props} />;
}

/**
 * Already mounted under the app shell. A drop tap arms the store and this
 * paints `CollectionPagePanel` on that commit, from the card
 * `warmDropPlaceOpen` stored. The route slot stays empty until this host
 * clears, so the flight does not add a second panel.
 */
export function DropPlaceInstantHost() {
  const instant = useSyncExternalStore(
    subscribeDropPlaceInstant,
    getDropPlaceInstant,
    getDropPlaceInstantServer
  );
  const pathname = usePathname();
  const openDropPlace = useDropPlaceOpen();
  const armInApp = useArmOsInAppScreen();
  const notedPath = useRef<string | null>(null);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_E2E_WALLET !== '1') return;
    const open = (collectionId: string) => {
      const id = collectionId.trim();
      if (!id) return;
      openDropPlace({ href: collectionPath(id) });
    };
    (window as E2EWindow).__osOpenUncachedDrop = open;
    return () => {
      const e2e = window as E2EWindow;
      if (e2e.__osOpenUncachedDrop === open) delete e2e.__osOpenUncachedDrop;
    };
  }, [openDropPlace]);

  useLayoutEffect(() => {
    if (!instant) {
      notedPath.current = null;
      return;
    }
    if (notedPath.current !== instant.pathname) {
      notedPath.current = instant.pathname;
      armInApp(instant.pathname);
    }
    // pushState moves the address bar before Next's pathname. Back (or a
    // different navigation) leaves both off this drop — clear even if Next
    // had not committed yet, or the panel would stay on top of the feed.
    const browserPath =
      typeof window === 'undefined' ? pathname : window.location.pathname;
    const onDrop =
      browserPath === instant.pathname || pathname === instant.pathname;
    if (!onDrop) {
      clearDropPlaceInstant();
      return;
    }
    if (pathname === instant.pathname && !instant.committed) {
      commitDropPlaceInstant();
    }
  }, [armInApp, instant, pathname]);

  if (!instant) return null;
  // pageDrawer sits over the summon dock and under portaled sheets.
  return (
    <div
      data-drop-place-instant=""
      style={{ position: 'fixed', inset: 0, zIndex: SHEET_Z.pageDrawer }}
    >
      <DropPlaceInstantPanel
        key={instant.collectionId}
        collectionId={instant.collectionId}
        editionToken={instant.editionToken}
      />
    </div>
  );
}
