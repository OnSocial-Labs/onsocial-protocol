'use client';

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Divider,
  MultiplyIcon,
  PauseFillIcon,
  PlayFillIcon,
  ScaleUpIcon,
} from '@onsocial/ui';
import {
  ActionDrawer,
  type ActionDrawerItem,
} from '@/components/ui/action-drawer';
import { useCollectiblesNowPlayingOptional } from '@/contexts/collectibles-now-playing-context';
import {
  APP_COLLECTIBLES_PLAY_PATH,
  APP_COLLECTION_PATH,
  collectiblesPlayPath,
  collectionPath,
} from '@/lib/app-routes';

const LONG_PRESS_MS = 480;
const TAP_SLOP_PX = 12;

/**
 * Dock-native now-playing: cover between summon grip and compose.
 * Tap = play/pause; hold = Open player · Stop.
 */
export function CollectiblesNowPlayingDockChip() {
  const np = useCollectiblesNowPlayingOptional();
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerStart = useRef<{
    x: number;
    y: number;
    longPress: boolean;
  } | null>(null);

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const openPlayer = useCallback(() => {
    const collectionId = np?.session?.collectionId;
    if (!collectionId) return;
    setMenuOpen(false);
    router.push(collectiblesPlayPath(collectionId), { scroll: false });
  }, [np?.session?.collectionId, router]);

  const stopPlayback = useCallback(() => {
    setMenuOpen(false);
    np?.stop();
  }, [np]);

  const menuItems: ActionDrawerItem[] = useMemo(
    () => [
      {
        id: 'open',
        label: 'Open player',
        description: 'Full listen controls',
        leading: <ScaleUpIcon className="action-drawer-icon" aria-hidden />,
        onSelect: openPlayer,
      },
      {
        id: 'stop',
        label: 'Stop',
        description: 'Clear now playing',
        leading: <MultiplyIcon className="action-drawer-icon" aria-hidden />,
        destructive: true,
        onSelect: stopPlayback,
      },
    ],
    [openPlayer, stopPlayback]
  );

  const session = np?.session ?? null;
  const engaged = Boolean(np?.engaged);
  const activeIndex = np?.activeIndex ?? 0;
  const playing = Boolean(np?.playing);
  const toggle = np?.toggle;
  const track = session?.tracks[activeIndex] ?? session?.tracks[0];
  const trackTitle = track?.title?.trim() || session?.title || 'Now playing';
  const cover = session?.poster?.trim() || null;

  const onPlaySurface =
    pathname === APP_COLLECTIBLES_PLAY_PATH ||
    pathname.startsWith(`${APP_COLLECTIBLES_PLAY_PATH}/`);
  const onThisDrop = Boolean(
    session &&
      (pathname === collectionPath(session.collectionId) ||
        pathname === `${APP_COLLECTION_PATH}/${session.collectionId}`)
  );
  const visible = Boolean(session && engaged && !onPlaySurface && !onThisDrop);

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    pointerStart.current = {
      x: event.clientX,
      y: event.clientY,
      longPress: false,
    };
    clearLongPress();
    longPressTimer.current = setTimeout(() => {
      if (!pointerStart.current) return;
      pointerStart.current.longPress = true;
      setMenuOpen(true);
    }, LONG_PRESS_MS);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const start = pointerStart.current;
    if (!start) return;
    if (
      Math.abs(event.clientX - start.x) > TAP_SLOP_PX ||
      Math.abs(event.clientY - start.y) > TAP_SLOP_PX
    ) {
      clearLongPress();
    }
  };

  const finishPointer = () => {
    const start = pointerStart.current;
    clearLongPress();
    pointerStart.current = null;
    if (!start || start.longPress) return;
    void toggle?.();
  };

  if (!visible || !session) return null;

  return (
    <>
      <Divider
        orientation="vertical"
        variant="detail"
        className="portfolio-summon-divider"
      />
      <button
        type="button"
        className={`portfolio-summon-now-playing${cover ? ' has-media' : ''}`}
        aria-label={
          playing
            ? `Pause ${trackTitle}. Hold for more.`
            : `Play ${trackTitle}. Hold for more.`
        }
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={() => {
          clearLongPress();
          pointerStart.current = null;
        }}
        onContextMenu={(event) => event.preventDefault()}
      >
        <span className="portfolio-summon-now-playing-cover" aria-hidden>
          {cover ? <img src={cover} alt="" draggable={false} /> : null}
        </span>
        <span className="portfolio-summon-now-playing-glyph" aria-hidden>
          {playing ? (
            <PauseFillIcon className="portfolio-summon-now-playing-icon" />
          ) : (
            <PlayFillIcon className="portfolio-summon-now-playing-icon portfolio-summon-now-playing-icon--play" />
          )}
        </span>
      </button>
      <ActionDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        label={trackTitle}
        copy={session.title !== trackTitle ? session.title : undefined}
        listAriaLabel="Now playing options"
        items={menuItems}
      />
    </>
  );
}
