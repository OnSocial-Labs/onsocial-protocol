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
import type { ScarcePlayableMedia } from '@/features/market/market-listings';
import {
  cachedTrackCids,
  clearPersistedNowPlayingSession,
  isTrackCached,
  persistNowPlayingSession,
  readPersistedNowPlayingSession,
  resolvePlayableSrc,
  trackCidFromPlayable,
} from '@/lib/collectibles-offline';
import {
  beginPlaybackLoad,
  playbackLoadIsCurrent,
  shouldApplyPlaybackSrc,
} from '@/lib/playback-load';
import { isRenderablePostAudioMime } from '@/lib/post-media';

export interface CollectiblesNowPlayingSession {
  collectionId: string;
  title: string;
  poster: string | null;
  tracks: ScarcePlayableMedia[];
  /** Track that starts playback, counting from 0. Omitted starts at the first. */
  startIndex?: number;
  /** Restored offline library — skip uncached tracks. */
  localOnly?: boolean;
}

interface CollectiblesNowPlayingContextValue {
  session: CollectiblesNowPlayingSession | null;
  activeIndex: number;
  playing: boolean;
  engaged: boolean;
  getAudio: () => HTMLAudioElement;
  /** Register / refresh album session (does not autoplay). */
  ensureSession: (session: CollectiblesNowPlayingSession) => void;
  /** Replace the dock with this release and start the opening track. One source load. */
  playSession: (session: CollectiblesNowPlayingSession) => void;
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

function openingTrackIndex(
  startIndex: number | undefined,
  trackCount: number
): number {
  if (!trackCount) return 0;
  if (typeof startIndex !== 'number' || !Number.isInteger(startIndex)) return 0;
  if (startIndex < 0 || startIndex >= trackCount) return 0;
  return startIndex;
}

export function CollectiblesNowPlayingProvider({
  children,
}: {
  children: ReactNode;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const loadGenRef = useRef(0);
  const sessionRef = useRef<CollectiblesNowPlayingSession | null>(null);
  const activeIndexRef = useRef(0);
  const blobUrlsRef = useRef<Map<string, string>>(new Map());
  const [session, setSession] = useState<CollectiblesNowPlayingSession | null>(
    null
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  /** True after the user has started playback at least once this session. */
  const [engaged, setEngaged] = useState(false);

  const resolveSrc = useCallback(async (track: ScarcePlayableMedia) => {
    const preferOffline =
      Boolean(sessionRef.current?.localOnly) ||
      (typeof navigator !== 'undefined' && navigator.onLine === false);
    const cid = trackCidFromPlayable(track);
    // Never reuse a blob URL while online — stale/corrupt OPFS can decode with
    // a timeline but no audible samples.
    if (preferOffline && cid) {
      const existing = blobUrlsRef.current.get(cid);
      if (existing) return existing;
    }
    const src = await resolvePlayableSrc(track, { preferOffline });
    if (preferOffline && cid && src.startsWith('blob:')) {
      blobUrlsRef.current.set(cid, src);
    }
    return src;
  }, []);

  const issueLoad = useCallback(() => {
    const step = beginPlaybackLoad(loadGenRef.current);
    loadGenRef.current = step.next;
    return step.issued;
  }, []);

  const loadIsCurrent = useCallback(
    (issued: number) => playbackLoadIsCurrent(issued, loadGenRef.current),
    []
  );

  const getAudio = useCallback(() => {
    if (!audioRef.current) {
      // Fallback before the host <audio> mounts (should be rare).
      audioRef.current = new Audio();
      audioRef.current.preload = 'metadata';
    }
    return audioRef.current;
  }, []);

  /** Detached / restored hosts can end up muted — arm before every play. */
  const armAudible = useCallback((audio: HTMLAudioElement) => {
    audio.muted = false;
    audio.volume = 1;
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
      void (async () => {
        const restrict =
          Boolean(current.localOnly) || navigator.onLine === false;
        let next = index + 1;
        while (next < current.tracks.length) {
          const track = current.tracks[next];
          if (!track || !isRenderablePostAudioMime(track.mime)) {
            next += 1;
            continue;
          }
          if (restrict) {
            const cid = trackCidFromPlayable(track);
            if (!cid || !(await isTrackCached(cid))) {
              next += 1;
              continue;
            }
          }
          if (sessionRef.current !== current) return;
          activeIndexRef.current = next;
          setActiveIndex(next);
          const issued = issueLoad();
          const src = await resolveSrc(track);
          if (!loadIsCurrent(issued) || sessionRef.current !== current) return;
          if (activeIndexRef.current !== next) return;
          audio.src = src;
          audio.load();
          persistNowPlayingSession({
            ...current,
            activeIndex: next,
          });
          armAudible(audio);
          void audio.play().catch(() => setPlaying(false));
          return;
        }
        setPlaying(false);
      })();
    };
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
    };
  }, [armAudible, getAudio, issueLoad, loadIsCurrent, resolveSrc]);

  const ensureSession = useCallback(
    (next: CollectiblesNowPlayingSession) => {
      const audio = getAudio();
      const prev = sessionRef.current;
      const sameCollection =
        prev != null && prev.collectionId === next.collectionId;
      const sameTracks =
        sameCollection &&
        tracksSignature(prev!.tracks) === tracksSignature(next.tracks);
      const sameMeta =
        sameTracks &&
        prev!.title === next.title &&
        (prev!.poster ?? null) === (next.poster ?? null);

      // No-op when nothing changed — avoids setState loops from mount effects.
      if (sameMeta) {
        if (prev?.localOnly) {
          const live = { ...next, localOnly: false };
          sessionRef.current = live;
          setSession(live);
        }
        persistNowPlayingSession({
          ...next,
          localOnly: false,
          activeIndex: activeIndexRef.current,
        });
        return;
      }

      // Same drop, different track-list shape (e.g. Buy sheet hydrates fewer
      // playables than the album page) — keep playback; prefer the richer list.
      if (sameCollection) {
        const tracks =
          next.tracks.length >= prev!.tracks.length
            ? next.tracks
            : prev!.tracks;
        const live = { ...next, tracks, localOnly: false };
        sessionRef.current = live;
        setSession(live);
        persistNowPlayingSession({
          ...live,
          activeIndex: activeIndexRef.current,
        });
        return;
      }

      const live = { ...next, localOnly: false };
      sessionRef.current = live;
      setSession(live);
      persistNowPlayingSession({
        ...live,
        activeIndex: 0,
      });
      activeIndexRef.current = 0;
      setActiveIndex(0);
      const first = next.tracks[0];
      if (first && isRenderablePostAudioMime(first.mime)) {
        const issued = issueLoad();
        void resolveSrc(first).then((src) => {
          if (!loadIsCurrent(issued) || sessionRef.current !== live) return;
          audio.src = src;
          audio.load();
        });
      }
    },
    [getAudio, issueLoad, loadIsCurrent, resolveSrc]
  );

  const playSession = useCallback(
    (next: CollectiblesNowPlayingSession) => {
      const audio = getAudio();
      const live = { ...next, localOnly: false };
      const switching = sessionRef.current?.collectionId !== live.collectionId;
      const startIndex = openingTrackIndex(live.startIndex, live.tracks.length);
      sessionRef.current = live;
      setSession(live);
      activeIndexRef.current = startIndex;
      setActiveIndex(startIndex);
      persistNowPlayingSession({ ...live, activeIndex: startIndex });
      const track = live.tracks[startIndex];
      if (!track || !isRenderablePostAudioMime(track.mime)) return;
      if (switching && !audio.paused) audio.pause();
      const issued = issueLoad();
      void (async () => {
        const src = await resolveSrc(track);
        if (!loadIsCurrent(issued) || sessionRef.current !== live) return;
        if (
          shouldApplyPlaybackSrc({
            mode: 'replace',
            indexChanged: true,
            hasSrc: Boolean(audio.src),
          })
        ) {
          audio.src = src;
          audio.load();
        }
        setEngaged(true);
        armAudible(audio);
        await audio.play().catch(() => setPlaying(false));
      })();
    },
    [armAudible, getAudio, issueLoad, loadIsCurrent, resolveSrc]
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
      persistNowPlayingSession({ ...current, activeIndex: index });
      const issued = issueLoad();
      const apply = async () => {
        const replace = shouldApplyPlaybackSrc({
          mode: 'if-needed',
          indexChanged,
          hasSrc: Boolean(audio.src),
        });
        if (replace) {
          const src = await resolveSrc(track);
          if (!loadIsCurrent(issued) || sessionRef.current !== current) return;
          audio.src = src;
          audio.load();
        } else if (!loadIsCurrent(issued)) {
          return;
        }
        if (autoplay) {
          setEngaged(true);
          armAudible(audio);
          await audio.play().catch(() => setPlaying(false));
        }
      };
      void apply();
    },
    [armAudible, getAudio, issueLoad, loadIsCurrent, resolveSrc]
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
      const issued = issueLoad();
      const src = await resolveSrc(track);
      if (!loadIsCurrent(issued) || sessionRef.current !== current) return;
      audio.src = src;
      audio.load();
    }
    try {
      setEngaged(true);
      armAudible(audio);
      await audio.play();
    } catch {
      setPlaying(false);
    }
  }, [armAudible, getAudio, issueLoad, loadIsCurrent, resolveSrc]);

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
    clearPersistedNowPlayingSession();
    for (const url of blobUrlsRef.current.values()) {
      URL.revokeObjectURL(url);
    }
    blobUrlsRef.current.clear();
  }, [getAudio]);

  useEffect(() => {
    const saved = readPersistedNowPlayingSession();
    if (!saved || sessionRef.current) return;
    let cancelled = false;
    void (async () => {
      const audio = getAudio();
      const cids = saved.tracks
        .map((track) => trackCidFromPlayable(track))
        .filter((cid): cid is string => Boolean(cid));
      const cached = await cachedTrackCids(cids);
      if (cancelled || cached.size === 0) return;
      let index = Math.min(
        Math.max(0, saved.activeIndex),
        Math.max(0, saved.tracks.length - 1)
      );
      const indexCid = trackCidFromPlayable(saved.tracks[index] ?? {});
      if (!indexCid || !cached.has(indexCid)) {
        const fallback = saved.tracks.findIndex((track) => {
          const cid = trackCidFromPlayable(track);
          return Boolean(cid && cached.has(cid));
        });
        if (fallback < 0) return;
        index = fallback;
      }
      const track = saved.tracks[index];
      if (!track || !isRenderablePostAudioMime(track.mime)) return;
      const restored = { ...saved, localOnly: true };
      // Mark localOnly before resolve so OPFS blobs are eligible offline-first.
      sessionRef.current = restored;
      const issued = issueLoad();
      const src = await resolveSrc(track);
      if (cancelled || !loadIsCurrent(issued)) return;
      activeIndexRef.current = index;
      setSession(restored);
      setActiveIndex(index);
      setEngaged(true);
      armAudible(audio);
      audio.src = src;
      audio.load();
    })();
    return () => {
      cancelled = true;
    };
  }, [armAudible, getAudio, issueLoad, loadIsCurrent, resolveSrc]);

  const value = useMemo(
    () => ({
      session,
      activeIndex,
      playing,
      engaged,
      getAudio,
      ensureSession,
      playSession,
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
      playSession,
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
      {/* Keep the host in the document — detached `new Audio()` can advance
          currentTime with no audible output on some browsers. */}
      <audio
        ref={(node) => {
          if (node) audioRef.current = node;
        }}
        preload="metadata"
        className="collectibles-now-playing-host-audio"
        aria-hidden
      />
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
