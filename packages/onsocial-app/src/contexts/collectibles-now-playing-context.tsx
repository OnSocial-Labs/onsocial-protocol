'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MultiplyIcon, PauseFillIcon, PlayFillIcon } from '@onsocial/ui';
import type { ScarcePlayableMedia } from '@/features/market/market-listings';
import {
  APP_COLLECTIBLES_PLAY_PATH,
  APP_COLLECTION_PATH,
  collectiblesPlayPath,
  collectionPath,
} from '@/lib/app-routes';
import { isRenderablePostAudioMime } from '@/lib/post-media';

export interface CollectiblesNowPlayingSession {
  collectionId: string;
  title: string;
  poster: string | null;
  tracks: ScarcePlayableMedia[];
}

interface CollectiblesNowPlayingContextValue {
  session: CollectiblesNowPlayingSession | null;
  activeIndex: number;
  playing: boolean;
  engaged: boolean;
  getAudio: () => HTMLAudioElement;
  /** Register / refresh album session (does not autoplay). */
  ensureSession: (session: CollectiblesNowPlayingSession) => void;
  setTrack: (index: number, autoplay?: boolean) => void;
  toggle: () => Promise<void>;
  pause: () => void;
  seek: (seconds: number) => void;
  stop: () => void;
}

const CollectiblesNowPlayingContext =
  createContext<CollectiblesNowPlayingContextValue | null>(null);

function tracksSignature(tracks: ScarcePlayableMedia[]): string {
  return tracks.map((t) => t.url).join('\0');
}

export function CollectiblesNowPlayingProvider({
  children,
}: {
  children: ReactNode;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sessionRef = useRef<CollectiblesNowPlayingSession | null>(null);
  const activeIndexRef = useRef(0);
  const [session, setSession] = useState<CollectiblesNowPlayingSession | null>(
    null
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  /** True after the user has started playback at least once this session. */
  const [engaged, setEngaged] = useState(false);

  const getAudio = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.preload = 'metadata';
    }
    return audioRef.current;
  }, []);

  useEffect(() => {
    const audio = getAudio();
    const onPlay = () => {
      setPlaying(true);
      setEngaged(true);
    };
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      const current = sessionRef.current;
      const index = activeIndexRef.current;
      if (!current) {
        setPlaying(false);
        return;
      }
      if (index < current.tracks.length - 1) {
        const next = index + 1;
        activeIndexRef.current = next;
        setActiveIndex(next);
        const track = current.tracks[next];
        if (!track) return;
        audio.src = track.url;
        audio.load();
        void audio.play().catch(() => setPlaying(false));
        return;
      }
      setPlaying(false);
    };
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
    };
  }, [getAudio]);

  const ensureSession = useCallback(
    (next: CollectiblesNowPlayingSession) => {
      const audio = getAudio();
      const prev = sessionRef.current;
      const sameAlbum =
        prev != null &&
        prev.collectionId === next.collectionId &&
        tracksSignature(prev.tracks) === tracksSignature(next.tracks);
      const sameMeta =
        sameAlbum &&
        prev!.title === next.title &&
        (prev!.poster ?? null) === (next.poster ?? null);

      // No-op when nothing changed — avoids setState loops from mount effects.
      if (sameMeta) return;

      sessionRef.current = next;
      setSession(next);
      if (!sameAlbum) {
        activeIndexRef.current = 0;
        setActiveIndex(0);
        const first = next.tracks[0];
        if (first && isRenderablePostAudioMime(first.mime)) {
          audio.src = first.url;
          audio.load();
        }
      }
    },
    [getAudio]
  );

  const setTrack = useCallback(
    (index: number, autoplay = false) => {
      const current = sessionRef.current;
      const audio = getAudio();
      if (!current) return;
      const track = current.tracks[index];
      if (!track || !isRenderablePostAudioMime(track.mime)) return;
      const indexChanged = index !== activeIndexRef.current;
      if (indexChanged) {
        activeIndexRef.current = index;
        setActiveIndex(index);
      }
      if (indexChanged || !audio.src) {
        audio.src = track.url;
        audio.load();
      }
      if (autoplay) {
        setEngaged(true);
        void audio.play().catch(() => setPlaying(false));
      }
    },
    [getAudio]
  );

  const toggle = useCallback(async () => {
    const audio = getAudio();
    const current = sessionRef.current;
    if (!current) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    if (!audio.src) {
      const track = current.tracks[activeIndexRef.current] ?? current.tracks[0];
      if (!track) return;
      audio.src = track.url;
      audio.load();
    }
    try {
      setEngaged(true);
      await audio.play();
    } catch {
      setPlaying(false);
    }
  }, [getAudio]);

  const pause = useCallback(() => {
    getAudio().pause();
  }, [getAudio]);

  const seek = useCallback(
    (seconds: number) => {
      const audio = getAudio();
      if (!Number.isFinite(seconds)) return;
      audio.currentTime = Math.max(0, seconds);
    },
    [getAudio]
  );

  const stop = useCallback(() => {
    const audio = getAudio();
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    sessionRef.current = null;
    activeIndexRef.current = 0;
    setSession(null);
    setActiveIndex(0);
    setPlaying(false);
    setEngaged(false);
  }, [getAudio]);

  const value = useMemo(
    () => ({
      session,
      activeIndex,
      playing,
      engaged,
      getAudio,
      ensureSession,
      setTrack,
      toggle,
      pause,
      seek,
      stop,
    }),
    [
      session,
      activeIndex,
      playing,
      engaged,
      getAudio,
      ensureSession,
      setTrack,
      toggle,
      pause,
      seek,
      stop,
    ]
  );

  return (
    <CollectiblesNowPlayingContext.Provider value={value}>
      {children}
      <CollectiblesNowPlayingMiniBar />
    </CollectiblesNowPlayingContext.Provider>
  );
}

export function useCollectiblesNowPlaying() {
  const context = useContext(CollectiblesNowPlayingContext);
  if (!context) {
    throw new Error(
      'useCollectiblesNowPlaying must be used within CollectiblesNowPlayingProvider'
    );
  }
  return context;
}

export function useCollectiblesNowPlayingOptional() {
  return useContext(CollectiblesNowPlayingContext);
}

function CollectiblesNowPlayingMiniBar() {
  const np = useCollectiblesNowPlayingOptional();
  const pathname = usePathname();
  if (!np?.session || !np.engaged) return null;

  const { session, activeIndex, playing, toggle, stop } = np;
  const onPlaySurface =
    pathname === APP_COLLECTIBLES_PLAY_PATH ||
    pathname.startsWith(`${APP_COLLECTIBLES_PLAY_PATH}/`);
  const onThisDrop =
    pathname === collectionPath(session.collectionId) ||
    pathname === `${APP_COLLECTION_PATH}/${session.collectionId}`;
  // Full controls live on play + this drop’s track list — hide mini chrome there.
  if (onPlaySurface || onThisDrop) return null;
  const track = session.tracks[activeIndex] ?? session.tracks[0];
  const trackTitle = track?.title?.trim() || session.title;
  const href = collectiblesPlayPath(session.collectionId);
  const cover = session.poster?.trim() || null;

  return (
    <div className="collectibles-now-playing" role="region" aria-label="Now playing">
      <Link
        href={href}
        scroll={false}
        className="collectibles-now-playing-main"
      >
        <span
          className={`collectibles-now-playing-cover${cover ? ' has-media' : ''}`}
        >
          {cover ? <img src={cover} alt="" /> : null}
        </span>
        <span className="collectibles-now-playing-copy">
          <span className="collectibles-now-playing-title">{trackTitle}</span>
          <span className="collectibles-now-playing-album">{session.title}</span>
        </span>
      </Link>
      <button
        type="button"
        className="collectibles-now-playing-toggle"
        aria-label={playing ? 'Pause' : 'Play'}
        onClick={() => {
          void toggle();
        }}
      >
        {playing ? (
          <PauseFillIcon className="collectibles-now-playing-toggle-icon" />
        ) : (
          <PlayFillIcon className="collectibles-now-playing-toggle-icon collectibles-now-playing-toggle-icon--play" />
        )}
      </button>
      <button
        type="button"
        className="collectibles-now-playing-close"
        aria-label="Stop playback"
        onClick={() => stop()}
      >
        <MultiplyIcon
          className="collectibles-now-playing-close-icon"
          aria-hidden
        />
      </button>
    </div>
  );
}
