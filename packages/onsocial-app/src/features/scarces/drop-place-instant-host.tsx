'use client';

import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useArmOsInAppScreen } from '@/components/providers/os-face-leave-provider';
import { CollectionPagePanel } from '@/features/scarces/collection-page-panel';
import {
  clearDropPlaceInstant,
  clearDropPlaceInstantCookie,
  commitDropPlaceInstant,
  getDropPlaceInstant,
  getDropPlaceInstantServer,
  instantDropFirstPaint,
  subscribeDropPlaceInstant,
} from '@/features/scarces/drop-place-instant';
import { navigateDropPlace } from '@/features/scarces/drop-place-open';
import { collectionPath } from '@/lib/app-routes';

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

/**
 * Already mounted under the app shell. A drop tap arms the store and this
 * paints `CollectionPagePanel` on that commit, from the card
 * `warmDropPlaceOpen` stored. The collection RSC returns nothing for that
 * navigation so this node is not replaced when the route arrives.
 */
export function DropPlaceInstantHost() {
  const instant = useSyncExternalStore(
    subscribeDropPlaceInstant,
    getDropPlaceInstant,
    getDropPlaceInstantServer
  );
  const pathname = usePathname();
  const router = useRouter();
  const armInApp = useArmOsInAppScreen();
  const notedPath = useRef<string | null>(null);

  useEffect(() => {
    if (!getDropPlaceInstant()) clearDropPlaceInstantCookie();
  }, []);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_E2E_WALLET !== '1') return;
    const open = (collectionId: string) => {
      const id = collectionId.trim();
      if (!id) return;
      navigateDropPlace(router as Parameters<typeof navigateDropPlace>[0], {
        href: collectionPath(id),
      });
    };
    (window as E2EWindow).__osOpenUncachedDrop = open;
    return () => {
      const e2e = window as E2EWindow;
      if (e2e.__osOpenUncachedDrop === open) delete e2e.__osOpenUncachedDrop;
    };
  }, [router]);

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
  return (
    <div
      data-drop-place-instant=""
      style={{ position: 'fixed', inset: 0, zIndex: 1 }}
    >
      <DropPlaceInstantPanel
        key={instant.collectionId}
        collectionId={instant.collectionId}
        editionToken={instant.editionToken}
      />
    </div>
  );
}
