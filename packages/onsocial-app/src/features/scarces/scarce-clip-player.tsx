'use client';

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import {
  HeartFillIcon,
  HeartIcon,
  NextFillIcon,
  PauseFillIcon,
  PlayFillIcon,
  PreviousFillIcon,
  ScaleUpIcon,
} from '@onsocial/ui';
import { MediaDownloadControl } from '@/components/ui/media-download-control';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useCollectiblesNowPlayingOptional } from '@/contexts/collectibles-now-playing-context';
import type { ScarcePlayableMedia } from '@/features/market/market-listings';
import { GuildFacepile } from '@/features/guilds/guild-facepile';
import { ScarceClipListenSheet } from '@/features/scarces/scarce-clip-listen-sheet';
import { ScarceClipShareButton } from '@/features/scarces/scarce-clip-share-button';
import { ScarceFansSheet } from '@/features/scarces/scarce-fans-sheet';
import { ScarceTrackOptionsMenu } from '@/features/scarces/scarce-track-options-menu';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { useScarceTrackLoves } from '@/hooks/use-scarce-track-loves';
import {
  albumHasAllTracksCached,
  cachedTrackCids,
  rememberCachedTrack,
  removeAlbumTracks,
  removeTrack,
  resolvePlayableSrc,
  trackCidFromPlayable,
} from '@/lib/collectibles-offline';
import {
  downloadIpfsAlbumZip,
  downloadIpfsMedia,
  exportIpfsAlbumTracks,
} from '@/lib/media-download';
import { isRenderablePostAudioMime } from '@/lib/post-media';
import { txToastError } from '@/lib/transaction-toast-copy';

interface ScarceClipPlayerProps {
  clip: ScarcePlayableMedia;
  /** Full album / multi-clip list; defaults to `[clip]`. */
  tracks?: ScarcePlayableMedia[];
  /** Scarce cover — the still wallets render, used as the poster / art. */
  poster?: string | null;
  /**
   * `cover` (default) — poster + play control, then optional track list.
   * `tracks` — track list only (under a separate static cover).
   */
  layout?: 'cover' | 'tracks';
  /**
   * When set (audio only), bind to the global Collectibles now-playing audio
   * so playback survives View drop / route changes.
   */
  persist?: { collectionId: string; title: string } | null;
  /** Creator of the drop — enables song loves + album fan count. */
  creatorId?: string | null;
  /** Holder / creator can keep audio offline. `null` = still checking. */
  canKeepOffline?: boolean | null;
  /** Overlay on cover art (e.g. Live status) — kept clear of scrub chrome. */
  coverBadge?: ReactNode;
  /**
   * Track list in this shell. Default: cover lists when multi-track; tracks
   * layout always lists. Set false on drop cover so songs sit under meta.
   */
  showTracks?: boolean;
  /**
   * Prev / play / next + scrubber for `tracks` layout. Cover uses in-art
   * chrome instead. Set false when the cover player already owns transport.
   */
  showTransport?: boolean;
  /**
   * Open full-screen listen immediately and hide the compact cover shell
   * (post-origin enlarge). Closing listen calls `onListenClose`.
   */
  immersiveListen?: boolean;
  /** Mint/Buy + post engagement under love/share in listen mode. */
  listenFooter?: ReactNode;
  onListenClose?: () => void;
}

function useBrowserOnline(): boolean {
  const [online, setOnline] = useState(
    () => typeof navigator === 'undefined' || navigator.onLine
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

function formatClipTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Cover-first player for video / audio scarces on buy / bid sheets.
 *
 * Shows the still cover with a play control. Tap to play the clip that is
 * actually being sold. Deliberately not `PostMediaBlock` — that registers
 * in the global feed one-video registry and would fight a thread underneath.
 *
 * Remount with `key={clip.url}` when the listing changes so play state
 * resets without an effect. Albums pass `tracks` for a selectable list.
 */
export function ScarceClipPlayer({
  clip,
  tracks,
  poster = null,
  layout = 'cover',
  persist = null,
  creatorId = null,
  canKeepOffline = false,
  coverBadge = null,
  showTracks,
  showTransport = true,
  immersiveListen = false,
  listenFooter = null,
  onListenClose,
}: ScarceClipPlayerProps) {
  const nowPlaying = useCollectiblesNowPlayingOptional();
  const { setTxResult } = useAppTransactionFeedback();
  const browserOnline = useBrowserOnline();
  const playlist =
    tracks && tracks.length > 0 ? tracks : ([clip] as ScarcePlayableMedia[]);
  const [activeIndex, setActiveIndex] = useState(0);
  const active = playlist[Math.min(activeIndex, playlist.length - 1)] ?? clip;
  const isAudio = isRenderablePostAudioMime(active.mime);
  const persistMode = Boolean(
    persist?.collectionId && isAudio && nowPlaying
  );
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const durationByUrlRef = useRef<Map<string, number>>(new Map());
  const scrubbingRef = useRef(false);
  const resumeAfterScrubRef = useRef(false);
  const playingRef = useRef(false);
  const durationRef = useRef(0);
  const currentTimeRef = useRef(0);
  const railRef = useRef<HTMLDivElement | null>(null);
  const elapsedRef = useRef<HTMLSpanElement | null>(null);
  const scrubInputRef = useRef<HTMLInputElement | null>(null);
  const listenRailRef = useRef<HTMLDivElement | null>(null);
  const listenElapsedRef = useRef<HTMLSpanElement | null>(null);
  const listenScrubInputRef = useRef<HTMLInputElement | null>(null);
  const activeScrubRailRef = useRef<HTMLDivElement | null>(null);
  const knobPeekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  /** Bump to autoplay after a track change (tap or natural advance). */
  const [autoplayNonce, setAutoplayNonce] = useState(0);
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [listenOpen, setListenOpen] = useState(immersiveListen);
  const [chromeVisible, setChromeVisible] = useState(true);
  const chromeHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [downloadLock, setDownloadLock] = useState<string | null>(null);
  const [cachedCids, setCachedCids] = useState<Set<string>>(() => new Set());
  const [localSrc, setLocalSrc] = useState(active.url);
  const [duration, setDuration] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [knobPeek, setKnobPeek] = useState(false);
  const [fansOpen, setFansOpen] = useState(false);
  const tracksOnly = layout === 'tracks' && isAudio;
  const coverChrome = isAudio && !tracksOnly;
  const activeLyrics = active.lyrics?.trim() || '';
  const hasLyrics = Boolean(activeLyrics);
  /** Keep the scrubber mounted for audio — hiding it on track change causes flicker. */
  const showProgress = isAudio;

  function clearChromeHideTimer() {
    if (chromeHideTimerRef.current != null) {
      clearTimeout(chromeHideTimerRef.current);
      chromeHideTimerRef.current = null;
    }
  }

  function pokeChrome(holdMs = 2600) {
    setChromeVisible(true);
    clearChromeHideTimer();
    if (scrubbingRef.current) return;
    // Stay visible while paused / not started — hide only during playback.
    if (!playingRef.current) return;
    chromeHideTimerRef.current = setTimeout(() => {
      chromeHideTimerRef.current = null;
      if (!scrubbingRef.current && playingRef.current) {
        setChromeVisible(false);
      }
    }, holdMs);
  }

  useEffect(() => {
    return () => clearChromeHideTimer();
  }, []);

  useEffect(() => {
    if (!coverChrome) return;
    if (scrubbing) {
      clearChromeHideTimer();
      setChromeVisible(true);
      return;
    }
    pokeChrome();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scrubbing edge only
  }, [coverChrome, scrubbing]);

  // Keep ref in sync before chrome logic so pokeChrome sees the latest state.
  useEffect(() => {
    playingRef.current = playing;
    if (!coverChrome) return;
    if (!playing) {
      clearChromeHideTimer();
      setChromeVisible(true);
      return;
    }
    pokeChrome();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- playing edge only
  }, [coverChrome, playing]);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  useEffect(() => {
    if (!listenOpen) return;
    paintProgress(currentTimeRef.current, durationRef.current);
    // Sync listen scrubber once the sheet mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open only
  }, [listenOpen]);

  useEffect(() => {
    if (immersiveListen) setListenOpen(true);
  }, [immersiveListen]);

  const playlistKey = playlist.map((t) => t.url).join('\0');
  const loves = useScarceTrackLoves({
    creatorId,
    collectionId: persist?.collectionId,
    tracks: playlist,
  });
  const facepileIds = loves.fanIds.slice(0, 5);
  const facepileProfiles = usePostAuthorProfiles(facepileIds);
  const showFansFacepile = loves.fanCount > 0;
  const fansFacepile = showFansFacepile ? (
    <GuildFacepile
      memberIds={facepileIds}
      profiles={facepileProfiles}
      memberCount={loves.fanCount}
      countUnit={{ one: 'fan', other: 'fans' }}
      slots={Math.min(5, Math.max(1, loves.fanCount))}
      loading={loves.fansLoading && facepileIds.length === 0}
      className="scarce-clip-fans-facepile"
      onClick={() => setFansOpen(true)}
    />
  ) : null;
  const ensureSession = nowPlaying?.ensureSession;
  const getAudio = nowPlaying?.getAudio;
  const setHostTrack = nowPlaying?.setTrack;
  const hostActiveIndex = nowPlaying?.activeIndex;
  const hostPlaying = nowPlaying?.playing;
  const hostHasSession = Boolean(nowPlaying?.session);

  // Register album with the global audio host (survives View drop).
  useEffect(() => {
    if (!persistMode || !persist || !ensureSession) return;
    ensureSession({
      collectionId: persist.collectionId,
      title: persist.title,
      poster: poster?.trim() || null,
      tracks: playlist,
    });
    // playlist identity is tracked via playlistKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    persistMode,
    persist?.collectionId,
    persist?.title,
    poster,
    playlistKey,
    ensureSession,
  ]);

  useEffect(() => {
    let cancelled = false;
    const cids = playlistKey
      ? playlist
          .map((track) => trackCidFromPlayable(track))
          .filter((cid): cid is string => Boolean(cid))
      : [];
    void cachedTrackCids(cids).then((next) => {
      if (!cancelled) setCachedCids(next);
    });
    return () => {
      cancelled = true;
    };
    // playlist identity is tracked via playlistKey
    // eslint-disable-next-line react-hooks/exhaustive-deps -- playlistKey
  }, [playlistKey]);

  useEffect(() => {
    if (persistMode) return;
    let cancelled = false;
    const network = active.url;
    setLocalSrc(network);
    void resolvePlayableSrc(
      {
        url: active.url,
        mime: active.mime,
        cid: active.cid,
      },
      {
        preferOffline:
          Boolean(nowPlaying?.session?.localOnly) || browserOnline === false,
      }
    ).then((src) => {
      if (!cancelled) setLocalSrc(src);
    });
    return () => {
      cancelled = true;
    };
  }, [
    persistMode,
    active.url,
    active.cid,
    active.mime,
    cachedCids,
    browserOnline,
    nowPlaying?.session?.localOnly,
  ]);

  // Bind local mediaRef + UI to the shared <audio> element.
  useEffect(() => {
    if (!persistMode || !getAudio) return;
    const audio = getAudio();
    mediaRef.current = audio;

    const onPlay = () => {
      setPlaying(true);
      setStarted(true);
    };
    const onPause = () => {
      if (scrubbingRef.current) return;
      setPlaying(false);
    };
    const onLoaded = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        durationByUrlRef.current.set(audio.src, audio.duration);
        durationRef.current = audio.duration;
        setDuration(audio.duration);
      }
      if (!scrubbingRef.current) {
        paintProgress(audio.currentTime, audio.duration);
      }
    };

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('durationchange', onLoaded);

    // Hydrate from live session (e.g. returning from View drop).
    if (hostActiveIndex != null) setActiveIndex(hostActiveIndex);
    setPlaying(Boolean(hostPlaying));
    setStarted(hostHasSession);
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      durationRef.current = audio.duration;
      setDuration(audio.duration);
    }
    paintProgress(audio.currentTime, audio.duration || durationRef.current);

    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('durationchange', onLoaded);
      // Keep global audio running — only detach the local ref.
      if (mediaRef.current === audio) {
        mediaRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bind once per album; hydrate via host* fields
  }, [persistMode, getAudio, persist?.collectionId]);

  // Keep track highlight in sync when the host advances on `ended`.
  useEffect(() => {
    if (!persistMode || hostActiveIndex == null) return;
    if (hostActiveIndex === activeIndex) return;
    setActiveIndex(hostActiveIndex);
    setLyricsOpen(false);
  }, [persistMode, hostActiveIndex, activeIndex]);

  // Keep play glyph in sync with the host while this surface is mounted.
  useEffect(() => {
    if (!persistMode || hostPlaying == null) return;
    setPlaying(hostPlaying);
    if (hostPlaying) setStarted(true);
  }, [persistMode, hostPlaying]);

  function clampTime(next: number): number {
    if (!Number.isFinite(next)) return 0;
    const total = durationRef.current;
    if (total <= 0) return Math.max(0, next);
    return Math.min(Math.max(next, 0), total);
  }

  /**
   * Paint playhead via DOM only — never React style props.
   * (React re-renders were overwriting rAF and causing the tick.)
   */
  function paintProgress(time: number, total = durationRef.current) {
    const p = total > 0 ? Math.min(1, Math.max(0, time / total)) : 0;
    currentTimeRef.current = time;
    const stamped = p.toFixed(4);
    const label = formatClipTime(time);
    for (const rail of [railRef.current, listenRailRef.current]) {
      rail?.style.setProperty('--scarce-clip-p', stamped);
    }
    for (const elapsed of [elapsedRef.current, listenElapsedRef.current]) {
      if (elapsed) elapsed.textContent = label;
    }
    for (const input of [scrubInputRef.current, listenScrubInputRef.current]) {
      if (!input) continue;
      input.value = String(time);
      input.setAttribute('aria-valuetext', label);
    }
  }

  /** Map click/drag X to time using the visual rail — not native range thumb inset. */
  function timeFromClientX(clientX: number): number {
    const rail = activeScrubRailRef.current ?? railRef.current;
    const total = durationRef.current;
    if (!rail || total <= 0) return 0;
    const rect = rail.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return ratio * total;
  }

  function clearKnobPeekTimer() {
    if (knobPeekTimerRef.current != null) {
      clearTimeout(knobPeekTimerRef.current);
      knobPeekTimerRef.current = null;
    }
  }

  function showKnobPeek(holdMs = 1400) {
    clearKnobPeekTimer();
    setKnobPeek(true);
    knobPeekTimerRef.current = setTimeout(() => {
      setKnobPeek(false);
      knobPeekTimerRef.current = null;
    }, holdMs);
  }

  /** Preview only — never touch media.currentTime while dragging (avoids rewind audio). */
  function previewScrub(next: number) {
    paintProgress(clampTime(next));
  }

  function beginScrub() {
    if (scrubbingRef.current) return;
    scrubbingRef.current = true;
    setScrubbing(true);
    clearKnobPeekTimer();
    setKnobPeek(true);
    const media = mediaRef.current;
    const wasPlaying = Boolean(media && !media.paused);
    resumeAfterScrubRef.current = wasPlaying;
    if (media && wasPlaying) {
      media.pause();
    }
  }

  function endScrub(next?: number) {
    if (!scrubbingRef.current) return;
    const media = mediaRef.current;
    const target = clampTime(next ?? currentTimeRef.current);
    if (media) {
      media.currentTime = target;
    }
    paintProgress(target);
    scrubbingRef.current = false;
    setScrubbing(false);
    // Drop pointer focus so the knob can hide (keyboard still uses :focus-visible).
    scrubInputRef.current?.blur();
    listenScrubInputRef.current?.blur();
    activeScrubRailRef.current = null;
    showKnobPeek(1400);
    if (resumeAfterScrubRef.current && media) {
      resumeAfterScrubRef.current = false;
      void media
        .play()
        .then(() => setPlaying(true))
        .catch(() => setPlaying(false));
    } else {
      resumeAfterScrubRef.current = false;
    }
  }

  useEffect(() => {
    if (autoplayNonce === 0) return;
    if (persistMode && setHostTrack) {
      setHostTrack(activeIndex, true);
      return;
    }
    const media = mediaRef.current;
    if (!media) return;
    let cancelled = false;
    // Same <audio> node across tracks — force load so src swaps don't stall.
    media.load();
    void media
      .play()
      .then(() => {
        if (!cancelled) setPlaying(true);
      })
      .catch(() => {
        if (!cancelled) setPlaying(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active.url, autoplayNonce, persistMode, setHostTrack, activeIndex]);

  // Smooth playhead — DOM paint only, no setState (avoids tick from re-render).
  useEffect(() => {
    if (!playing || scrubbing || !isAudio) return;
    let raf = 0;
    const tick = () => {
      const media = mediaRef.current;
      if (media && !scrubbingRef.current) {
        const total = media.duration;
        paintProgress(
          media.currentTime,
          Number.isFinite(total) && total > 0 ? total : durationRef.current
        );
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [playing, scrubbing, isAudio, active.url]);

  useEffect(() => {
    return () => {
      clearKnobPeekTimer();
    };
  }, []);

  function rememberDuration(url: string, next: number) {
    if (!Number.isFinite(next) || next <= 0) return;
    durationByUrlRef.current.set(url, next);
    durationRef.current = next;
    setDuration(next);
  }

  function onTimeUpdate(event: SyntheticEvent<HTMLMediaElement>) {
    if (scrubbingRef.current || playingRef.current) return;
    paintProgress(event.currentTarget.currentTime);
  }

  function onLoadedMetadata(event: SyntheticEvent<HTMLMediaElement>) {
    const media = event.currentTarget;
    rememberDuration(active.url, media.duration);
    if (!scrubbingRef.current) {
      paintProgress(media.currentTime, media.duration);
    }
  }

  async function togglePlayback() {
    if (restrictToCached) {
      const cid = trackCidFromPlayable(active);
      if (!cid || !cachedCids.has(cid)) return;
    }
    const media = mediaRef.current;
    if (!media) return;
    if (playing) {
      media.pause();
      setPlaying(false);
      return;
    }
    setStarted(true);
    try {
      media.muted = false;
      media.volume = 1;
      await media.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  }

  function canSelectIndex(index: number): boolean {
    const track = playlist[index];
    if (!track) return false;
    if (!(nowPlaying?.session?.localOnly || browserOnline === false)) {
      return true;
    }
    const cid = trackCidFromPlayable(track);
    return Boolean(cid && cachedCids.has(cid));
  }

  function selectTrack(index: number) {
    if (index === activeIndex) {
      void togglePlayback();
      return;
    }
    if (!canSelectIndex(index)) return;
    const next = playlist[index];
    const cached = next ? durationByUrlRef.current.get(next.url) : undefined;
    setActiveIndex(index);
    setStarted(true);
    setPlaying(true);
    setLyricsOpen(false);
    const nextDuration = cached ?? duration;
    if (cached != null) {
      durationRef.current = cached;
      setDuration(cached);
    }
    paintProgress(0, nextDuration);
    if (persistMode && setHostTrack) {
      setHostTrack(index, true);
      return;
    }
    setAutoplayNonce((n) => n + 1);
  }

  function seekToStart() {
    const media = mediaRef.current;
    if (media) media.currentTime = 0;
    paintProgress(0);
  }

  function skipTrack(delta: -1 | 1) {
    const next = activeIndex + delta;
    if (!canSelectIndex(next)) return;
    selectTrack(next);
  }

  /** Previous: restart if past 3s, else prior track (or restart on first). */
  function skipPrevious() {
    if (currentTimeRef.current > 3) {
      seekToStart();
      return;
    }
    if (canSelectIndex(activeIndex - 1)) {
      skipTrack(-1);
      return;
    }
    seekToStart();
  }

  function skipNext() {
    skipTrack(1);
  }

  function onEnded() {
    // Persist host advances tracks globally — avoid double-advance.
    if (persistMode) {
      setPlaying(false);
      return;
    }
    if (activeIndex < playlist.length - 1) {
      selectTrack(activeIndex + 1);
      return;
    }
    setPlaying(false);
  }

  const cover = poster?.trim() || null;
  const showTrackList =
    showTracks ?? (isAudio && (tracksOnly || playlist.length > 1));
  const showTracksTransport = tracksOnly && showTransport && showProgress;
  const canDownloadAudio = isAudio && playlist.length > 0;
  const albumCids = playlist
    .map((track) => trackCidFromPlayable(track))
    .filter((cid): cid is string => Boolean(cid));
  const albumCached = albumHasAllTracksCached(albumCids, cachedCids);
  const offlineAllowed = canKeepOffline === true;
  const offlineUnknown = canKeepOffline == null;
  const restrictToCached =
    Boolean(nowPlaying?.session?.localOnly) || browserOnline === false;
  const playDisabled =
    restrictToCached &&
    !cachedCids.has(trackCidFromPlayable(active) ?? '');
  const downloadItems = playlist.map((track, index) => ({
    cid: track.cid,
    url: track.url,
    mime: track.mime,
    title: track.title,
    fallbackName: `track-${index + 1}`,
  }));

  async function cacheOfflineBytes(args: {
    cid: string;
    mime: string;
    blob: Blob;
    track: ScarcePlayableMedia;
  }) {
    if (!persist?.collectionId) return;
    await rememberCachedTrack({
      collectionId: persist.collectionId,
      title: persist.title,
      poster: poster?.trim() || null,
      track: { ...args.track, cid: args.cid, mime: args.mime },
      blob: args.blob,
    });
    setCachedCids((current) => new Set(current).add(args.cid));
  }

  function reportOfflineError(cause: unknown, fallback: string) {
    if (cause instanceof DOMException && cause.name === 'AbortError') return;
    setTxResult({
      type: 'error',
      msg: cause instanceof Error ? cause.message : fallback,
    });
  }

  const audioMediaProps = {
    preload: 'metadata' as const,
    onEnded,
    onPause: () => {
      // Pause-for-scrub must not flip the play glyph mid-drag.
      if (scrubbingRef.current) return;
      setPlaying(false);
    },
    onPlay: () => setPlaying(true),
    onTimeUpdate,
    onLoadedMetadata,
    onDurationChange: onLoadedMetadata,
  };

  return (
    <div
      className={`scarce-clip-player-shell${
        tracksOnly ? ' scarce-clip-player-shell--tracks' : ''
      }${isAudio ? ' scarce-clip-player-shell--audio' : ''}${
        immersiveListen ? ' scarce-clip-player-shell--immersive' : ''
      }`}
    >
      {tracksOnly ? (
        persistMode ? null : (
          <audio
            ref={(node) => {
              mediaRef.current = node;
            }}
            src={localSrc}
            {...audioMediaProps}
          />
        )
      ) : (
        <div
          className={[
            'scarce-clip-player',
            isAudio ? 'scarce-clip-player--audio' : 'scarce-clip-player--video',
            playing ? 'is-playing' : '',
            coverChrome && chromeVisible ? ' is-chrome' : '',
            coverChrome && !chromeVisible ? ' is-chrome-hidden' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {isAudio ? (
            <>
              <button
                type="button"
                className="scarce-clip-player-cover-hit"
                aria-label={
                  !playing
                    ? 'Player controls'
                    : chromeVisible
                      ? 'Hide player controls'
                      : 'Show player controls'
                }
                onClick={() => {
                  // Paused / idle — chrome stays up; cover tap does not hide it.
                  if (!playingRef.current) {
                    setChromeVisible(true);
                    return;
                  }
                  if (chromeVisible) {
                    clearChromeHideTimer();
                    setChromeVisible(false);
                  } else {
                    pokeChrome();
                  }
                }}
              >
                {cover ? (
                  <img className="scarce-clip-player-cover" src={cover} alt="" />
                ) : (
                  <div className="scarce-clip-player-cover scarce-clip-player-cover--empty" />
                )}
              </button>
              {persistMode ? null : (
                <audio
                  ref={(node) => {
                    mediaRef.current = node;
                  }}
                  src={localSrc}
                  {...audioMediaProps}
                />
              )}
              <div
                className={`scarce-clip-cover-chrome${
                  chromeVisible ? ' is-visible' : ''
                }`}
              >
                <div className="scarce-clip-cover-transport">
                  <button
                    type="button"
                    className="scarce-clip-player-play scarce-clip-player-play--skip"
                    aria-label="Previous track"
                    disabled={playDisabled}
                    onClick={(event) => {
                      event.stopPropagation();
                      pokeChrome();
                      skipPrevious();
                    }}
                  >
                    <PreviousFillIcon
                      className="scarce-clip-player-play-glyph"
                      aria-hidden
                    />
                  </button>
                  <button
                    type="button"
                    className="scarce-clip-player-play"
                    aria-label={
                      playDisabled
                        ? 'Unavailable offline'
                        : playing
                          ? 'Pause'
                          : 'Play'
                    }
                    disabled={playDisabled}
                    onClick={(event) => {
                      event.stopPropagation();
                      pokeChrome();
                      void togglePlayback();
                    }}
                  >
                    <span className="scarce-clip-player-play-icon" aria-hidden>
                      {playing ? (
                        <PauseFillIcon className="scarce-clip-player-play-glyph scarce-clip-player-play-glyph--pause" />
                      ) : (
                        <PlayFillIcon className="scarce-clip-player-play-glyph scarce-clip-player-play-glyph--play" />
                      )}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="scarce-clip-player-play scarce-clip-player-play--skip"
                    aria-label="Next track"
                    disabled={
                      playDisabled || !canSelectIndex(activeIndex + 1)
                    }
                    onClick={(event) => {
                      event.stopPropagation();
                      pokeChrome();
                      skipNext();
                    }}
                  >
                    <NextFillIcon
                      className="scarce-clip-player-play-glyph"
                      aria-hidden
                    />
                  </button>
                </div>
                <div className="scarce-clip-cover-progress">
                  <div className="scarce-clip-cover-progress-meta">
                    <span className="scarce-clip-cover-time-pill">
                      <span
                        ref={elapsedRef}
                        className="scarce-clip-time-elapsed"
                        suppressHydrationWarning
                      >
                        0:00
                      </span>
                      <span className="scarce-clip-time-sep" aria-hidden>
                        /
                      </span>
                      <span className="scarce-clip-time-total">
                        {formatClipTime(duration)}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="scarce-clip-cover-expand"
                      aria-label="Open listen mode"
                      onClick={(event) => {
                        event.stopPropagation();
                        pokeChrome();
                        setListenOpen(true);
                      }}
                    >
                      <ScaleUpIcon
                        className="scarce-clip-cover-expand-icon"
                        aria-hidden
                      />
                    </button>
                  </div>
                  <div
                    className={`scarce-clip-progress-track${
                      scrubbing ? ' is-scrubbing' : ''
                    }${knobPeek ? ' is-knob-peek' : ''}${
                      duration <= 0 ? ' is-disabled' : ''
                    }`}
                    onPointerEnter={() => {
                      clearKnobPeekTimer();
                      setKnobPeek(true);
                    }}
                    onPointerLeave={() => {
                      if (!scrubbingRef.current) showKnobPeek(1100);
                    }}
                  >
                    <div
                      ref={railRef}
                      className="scarce-clip-progress-rail"
                      aria-hidden
                    >
                      <div className="scarce-clip-progress-fill" />
                      <span className="scarce-clip-progress-knob" />
                    </div>
                    <input
                      key={active.url}
                      ref={scrubInputRef}
                      type="range"
                      className="scarce-clip-progress-scrub"
                      min={0}
                      max={duration > 0 ? duration : 1}
                      step={0.01}
                      defaultValue={0}
                      disabled={duration <= 0}
                      aria-label="Seek"
                      onPointerDown={(event) => {
                        if (durationRef.current <= 0) return;
                        event.preventDefault();
                        event.stopPropagation();
                        event.currentTarget.focus();
                        event.currentTarget.setPointerCapture(event.pointerId);
                        activeScrubRailRef.current = railRef.current;
                        pokeChrome();
                        beginScrub();
                        previewScrub(timeFromClientX(event.clientX));
                      }}
                      onPointerMove={(event) => {
                        if (!scrubbingRef.current) return;
                        previewScrub(timeFromClientX(event.clientX));
                      }}
                      onPointerUp={(event) => {
                        endScrub(timeFromClientX(event.clientX));
                        pokeChrome();
                        if (
                          event.currentTarget.hasPointerCapture(event.pointerId)
                        ) {
                          event.currentTarget.releasePointerCapture(
                            event.pointerId
                          );
                        }
                      }}
                      onPointerCancel={(event) => {
                        endScrub(timeFromClientX(event.clientX));
                        pokeChrome();
                      }}
                      onChange={(event) => {
                        if (scrubbingRef.current) return;
                        const media = mediaRef.current;
                        const capped = clampTime(
                          Number(event.currentTarget.value)
                        );
                        if (media) media.currentTime = capped;
                        paintProgress(capped);
                        showKnobPeek(1100);
                        pokeChrome();
                      }}
                    />
                  </div>
                </div>
              </div>
              {coverBadge ? (
                <div className="scarce-clip-cover-badge">{coverBadge}</div>
              ) : null}
            </>
          ) : (
            <video
              key={active.url}
              ref={(node) => {
                mediaRef.current = node;
              }}
              className="scarce-clip-player-video"
              src={active.url}
              {...(cover ? { poster: cover } : {})}
              playsInline
              preload="metadata"
              controls={started}
              onEnded={() => setPlaying(false)}
              onPause={() => setPlaying(false)}
              onPlay={() => {
                setStarted(true);
                setPlaying(true);
              }}
            />
          )}

          {!isAudio && !started ? (
            <button
              type="button"
              className="scarce-clip-player-play"
              aria-label={playing ? 'Pause' : 'Play'}
              onClick={(event) => {
                event.stopPropagation();
                void togglePlayback();
              }}
            >
              <span className="scarce-clip-player-play-icon" aria-hidden>
                {playing ? (
                  <PauseFillIcon className="scarce-clip-player-play-glyph scarce-clip-player-play-glyph--pause" />
                ) : (
                  <PlayFillIcon className="scarce-clip-player-play-glyph scarce-clip-player-play-glyph--play" />
                )}
              </span>
            </button>
          ) : null}
        </div>
      )}

      {tracksOnly && (playlist.length > 1 || showFansFacepile) ? (
        <div className="scarce-clip-tracks-head">
            <div className="scarce-clip-download-bar">
              {fansFacepile}
              {playlist.length > 1 ? (
                <>
                  <MediaDownloadControl
                    className="scarce-clip-download-control"
                    glyph="save"
                    ariaLabel="Save album to Files"
                    disabled={
                      downloadLock != null && downloadLock !== 'save-album'
                    }
                    onBusyChange={(busy) =>
                      setDownloadLock(busy ? 'save-album' : null)
                    }
                    onDownload={async (onProgress) => {
                      try {
                        await exportIpfsAlbumTracks(downloadItems, onProgress);
                      } catch (cause) {
                        reportOfflineError(
                          cause,
                          txToastError.offlineCacheFailed
                        );
                        throw cause;
                      }
                    }}
                  />
                  {offlineAllowed || offlineUnknown ? (
                    <MediaDownloadControl
                      className="scarce-clip-download-control"
                      ariaLabel="Download album"
                      cached={offlineAllowed && albumCached}
                      disabled={
                        offlineUnknown ||
                        (downloadLock != null && downloadLock !== 'album')
                      }
                      onBusyChange={(busy) =>
                        setDownloadLock(busy ? 'album' : null)
                      }
                      onRemove={
                        offlineAllowed
                          ? async () => {
                              try {
                                await removeAlbumTracks(albumCids);
                                setCachedCids(new Set());
                              } catch (cause) {
                                reportOfflineError(
                                  cause,
                                  txToastError.offlineRemoveFailed
                                );
                              }
                            }
                          : undefined
                      }
                      onDownload={async (onProgress) => {
                        try {
                          await downloadIpfsAlbumZip(
                            downloadItems,
                            persist?.title,
                            onProgress,
                            persist?.collectionId
                              ? {
                                  cacheOffline: true,
                                  exportFile: false,
                                  skipCids: cachedCids,
                                  onOfflineCache: async ({
                                    cid,
                                    mime,
                                    blob,
                                  }) => {
                                    const track =
                                      playlist.find(
                                        (entry) =>
                                          trackCidFromPlayable(entry) === cid
                                      ) ?? playlist[0]!;
                                    await cacheOfflineBytes({
                                      cid,
                                      mime,
                                      blob,
                                      track,
                                    });
                                  },
                                }
                              : undefined
                          );
                        } catch (cause) {
                          reportOfflineError(
                            cause,
                            txToastError.offlineCacheFailed
                          );
                          throw cause;
                        }
                      }}
                    />
                  ) : null}
                  {persist?.collectionId ? (
                    <ScarceClipShareButton
                      className="scarce-clip-download-control"
                      title={persist.title}
                      collectionId={persist.collectionId}
                      mediaUrl={poster}
                      mediumKind="audio"
                    />
                  ) : null}
                </>
              ) : null}
            </div>
        </div>
      ) : null}

      {showTracksTransport ? (
        <div className="scarce-clip-transport">
          <button
            type="button"
            className="scarce-clip-transport-btn"
            aria-label="Previous track"
            disabled={playDisabled}
            onClick={() => skipPrevious()}
          >
            <PreviousFillIcon
              className="scarce-clip-transport-icon"
              aria-hidden
            />
          </button>
          <button
            type="button"
            className="scarce-clip-transport-btn scarce-clip-transport-btn--play"
            aria-label={
              playDisabled
                ? 'Unavailable offline'
                : playing
                  ? 'Pause'
                  : 'Play'
            }
            disabled={playDisabled}
            onClick={() => {
              void togglePlayback();
            }}
          >
            {playing ? (
              <PauseFillIcon
                className="scarce-clip-transport-icon scarce-clip-transport-icon--pause"
                aria-hidden
              />
            ) : (
              <PlayFillIcon
                className="scarce-clip-transport-icon scarce-clip-transport-icon--play"
                aria-hidden
              />
            )}
          </button>
          <button
            type="button"
            className="scarce-clip-transport-btn"
            aria-label="Next track"
            disabled={playDisabled || !canSelectIndex(activeIndex + 1)}
            onClick={() => skipNext()}
          >
            <NextFillIcon
              className="scarce-clip-transport-icon"
              aria-hidden
            />
          </button>
        </div>
      ) : null}

      {showTracksTransport ? (
        <div className="scarce-clip-progress">
          <span
            ref={elapsedRef}
            className="scarce-clip-progress-time"
            suppressHydrationWarning
          >
            0:00
          </span>
          <div
            className={`scarce-clip-progress-track${
              scrubbing ? ' is-scrubbing' : ''
            }${knobPeek ? ' is-knob-peek' : ''}${
              duration <= 0 ? ' is-disabled' : ''
            }`}
            onPointerEnter={() => {
              clearKnobPeekTimer();
              setKnobPeek(true);
            }}
            onPointerLeave={() => {
              if (!scrubbingRef.current) showKnobPeek(1100);
            }}
          >
            <div ref={railRef} className="scarce-clip-progress-rail" aria-hidden>
              <div className="scarce-clip-progress-fill" />
              <span className="scarce-clip-progress-knob" />
            </div>
            <input
              key={active.url}
              ref={scrubInputRef}
              type="range"
              className="scarce-clip-progress-scrub"
              min={0}
              max={duration > 0 ? duration : 1}
              step={0.01}
              defaultValue={0}
              disabled={duration <= 0}
              aria-label="Seek"
              onPointerDown={(event) => {
                if (durationRef.current <= 0) return;
                event.preventDefault();
                event.currentTarget.focus();
                event.currentTarget.setPointerCapture(event.pointerId);
                activeScrubRailRef.current = railRef.current;
                beginScrub();
                previewScrub(timeFromClientX(event.clientX));
              }}
              onPointerMove={(event) => {
                if (!scrubbingRef.current) return;
                previewScrub(timeFromClientX(event.clientX));
              }}
              onPointerUp={(event) => {
                endScrub(timeFromClientX(event.clientX));
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }
              }}
              onPointerCancel={(event) => {
                endScrub(timeFromClientX(event.clientX));
              }}
              onChange={(event) => {
                // Pointer scrub uses rail math; this path is keyboard / a11y.
                if (scrubbingRef.current) return;
                const media = mediaRef.current;
                const capped = clampTime(Number(event.currentTarget.value));
                if (media) media.currentTime = capped;
                paintProgress(capped);
                showKnobPeek(1100);
              }}
            />
          </div>
          <span className="scarce-clip-progress-time">
            {formatClipTime(duration)}
          </span>
        </div>
      ) : null}

      {showTrackList ? (
        <>
          {!tracksOnly && (playlist.length > 1 || showFansFacepile) ? (
            <div className="scarce-clip-download-bar">
              {fansFacepile}
              {playlist.length > 1 ? (
                <>
                  <MediaDownloadControl
                    className="scarce-clip-download-control"
                    glyph="save"
                    ariaLabel="Save album to Files"
                    disabled={
                      downloadLock != null && downloadLock !== 'save-album'
                    }
                    onBusyChange={(busy) =>
                      setDownloadLock(busy ? 'save-album' : null)
                    }
                    onDownload={async (onProgress) => {
                      try {
                        await exportIpfsAlbumTracks(downloadItems, onProgress);
                      } catch (cause) {
                        reportOfflineError(
                          cause,
                          txToastError.offlineCacheFailed
                        );
                        throw cause;
                      }
                    }}
                  />
                  {offlineAllowed || offlineUnknown ? (
                    <MediaDownloadControl
                      className="scarce-clip-download-control"
                      ariaLabel="Download album"
                      cached={offlineAllowed && albumCached}
                      disabled={
                        offlineUnknown ||
                        (downloadLock != null && downloadLock !== 'album')
                      }
                      onBusyChange={(busy) =>
                        setDownloadLock(busy ? 'album' : null)
                      }
                      onRemove={
                        offlineAllowed
                          ? async () => {
                              try {
                                await removeAlbumTracks(albumCids);
                                setCachedCids(new Set());
                              } catch (cause) {
                                reportOfflineError(
                                  cause,
                                  txToastError.offlineRemoveFailed
                                );
                              }
                            }
                          : undefined
                      }
                      onDownload={async (onProgress) => {
                        try {
                          await downloadIpfsAlbumZip(
                            downloadItems,
                            persist?.title,
                            onProgress,
                            persist?.collectionId
                              ? {
                                  cacheOffline: true,
                                  exportFile: false,
                                  skipCids: cachedCids,
                                  onOfflineCache: async ({
                                    cid,
                                    mime,
                                    blob,
                                  }) => {
                                    const track =
                                      playlist.find(
                                        (entry) =>
                                          trackCidFromPlayable(entry) === cid
                                      ) ?? playlist[0]!;
                                    await cacheOfflineBytes({
                                      cid,
                                      mime,
                                      blob,
                                      track,
                                    });
                                  },
                                }
                              : undefined
                          );
                        } catch (cause) {
                          reportOfflineError(
                            cause,
                            txToastError.offlineCacheFailed
                          );
                          throw cause;
                        }
                      }}
                    />
                  ) : null}
                  {persist?.collectionId ? (
                    <ScarceClipShareButton
                      className="scarce-clip-download-control"
                      title={persist.title}
                      collectionId={persist.collectionId}
                      mediaUrl={poster}
                      mediumKind="audio"
                    />
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}
          <ol className="scarce-clip-track-list" aria-label="Tracks">
            {playlist.map((track, index) => {
              const label = track.title?.trim() || `Track ${index + 1}`;
              const isActive = index === activeIndex;
              const isPlaying = isActive && playing;
              const cid = trackCidFromPlayable(track);
              const trackCached = Boolean(cid && cachedCids.has(cid));
              const loved = loves.viewerLoves(track);
              const loveCount = loves.loveCountFor(track);
              const lovePending = loves.isLovePending(track);
              return (
                <li
                  key={`${track.url}-${index}`}
                  className={`scarce-clip-track${isActive ? ' is-active' : ''}${
                    isPlaying ? ' is-playing' : ''
                  }`}
                >
                  <button
                    type="button"
                    className={`scarce-clip-track-play${
                      isPlaying ? ' is-playing' : ''
                    }`}
                    aria-label={
                      restrictToCached && !trackCached
                        ? `${label} unavailable offline`
                        : isPlaying
                          ? `Pause ${label}`
                          : `Play ${label}`
                    }
                    disabled={restrictToCached && !trackCached}
                    onClick={() => {
                      selectTrack(index);
                    }}
                  >
                    {isPlaying ? (
                      <PauseFillIcon className="scarce-clip-track-play-icon scarce-clip-track-play-icon--pause" />
                    ) : (
                      <PlayFillIcon className="scarce-clip-track-play-icon scarce-clip-track-play-icon--play" />
                    )}
                  </button>
                  <button
                    type="button"
                    className="scarce-clip-track-title"
                    aria-current={isActive ? 'true' : undefined}
                    onClick={() => {
                      selectTrack(index);
                    }}
                  >
                    {index + 1}. {label}
                  </button>
                  {persist?.collectionId && creatorId && cid ? (
                    <button
                      type="button"
                      className={`scarce-clip-track-love${
                        loved ? ' is-loved' : ''
                      }${lovePending ? ' is-pending' : ''}`}
                      aria-label={
                        loved ? `Unlove ${label}` : `Love ${label}`
                      }
                      aria-pressed={loved}
                      disabled={lovePending}
                      onClick={() => {
                        void loves.toggleLove(track);
                      }}
                    >
                      {loved ? (
                        <HeartFillIcon
                          className="scarce-clip-track-love-icon"
                          aria-hidden
                        />
                      ) : (
                        <HeartIcon
                          className="scarce-clip-track-love-icon"
                          aria-hidden
                        />
                      )}
                      <span
                        className={`scarce-clip-track-love-count${
                          loveCount > 0 ? '' : ' is-empty'
                        }`}
                      >
                        {loveCount > 0 ? loveCount : 0}
                      </span>
                    </button>
                  ) : null}
                  <ScarceTrackOptionsMenu
                    label={label}
                    index={index}
                    cached={offlineAllowed && trackCached}
                    canKeepOffline={offlineAllowed}
                    offlineUnknown={offlineUnknown}
                    downloadLock={downloadLock}
                    onLockChange={(busy) =>
                      setDownloadLock(busy ? `menu-${index}` : null)
                    }
                    onSave={async (onProgress) => {
                      try {
                        await downloadIpfsMedia({
                          cid: track.cid,
                          url: track.url,
                          mime: track.mime,
                          title: track.title,
                          fallbackName: `track-${index + 1}`,
                          onProgress,
                          exportFile: true,
                        });
                      } catch (cause) {
                        reportOfflineError(
                          cause,
                          txToastError.offlineCacheFailed
                        );
                        throw cause;
                      }
                    }}
                    onDownload={async (onProgress) => {
                      try {
                        await downloadIpfsMedia({
                          cid: track.cid,
                          url: track.url,
                          mime: track.mime,
                          title: track.title,
                          fallbackName: `track-${index + 1}`,
                          onProgress,
                          cacheOffline: Boolean(persist?.collectionId),
                          exportFile: false,
                          onOfflineCache: async ({
                            cid: cachedCid,
                            mime,
                            blob,
                          }) => {
                            await cacheOfflineBytes({
                              cid: cachedCid,
                              mime,
                              blob,
                              track,
                            });
                          },
                        });
                      } catch (cause) {
                        reportOfflineError(
                          cause,
                          txToastError.offlineCacheFailed
                        );
                        throw cause;
                      }
                    }}
                    onRemove={
                      offlineAllowed && cid
                        ? async () => {
                            try {
                              await removeTrack(cid);
                              setCachedCids((current) => {
                                const next = new Set(current);
                                next.delete(cid);
                                return next;
                              });
                            } catch (cause) {
                              reportOfflineError(
                                cause,
                                txToastError.offlineRemoveFailed
                              );
                            }
                          }
                        : undefined
                    }
                  />
                </li>
              );
            })}
          </ol>
        </>
      ) : null}

      {/* Single-track cover downloads — skip when drop defers list under meta. */}
      {canDownloadAudio && !showTrackList && showTracks !== false ? (
        <div className="scarce-clip-download-bar">
          {fansFacepile}
          {persist?.collectionId && creatorId ? (
            <button
              type="button"
              className={`scarce-clip-track-love${
                loves.viewerLoves(active) ? ' is-loved' : ''
              }${loves.isLovePending(active) ? ' is-pending' : ''}`}
              aria-label={
                loves.viewerLoves(active)
                  ? `Unlove ${active.title?.trim() || 'track'}`
                  : `Love ${active.title?.trim() || 'track'}`
              }
              aria-pressed={loves.viewerLoves(active)}
              disabled={loves.isLovePending(active)}
              onClick={() => {
                void loves.toggleLove(active);
              }}
            >
              {loves.viewerLoves(active) ? (
                <HeartFillIcon
                  className="scarce-clip-track-love-icon"
                  aria-hidden
                />
              ) : (
                <HeartIcon className="scarce-clip-track-love-icon" aria-hidden />
              )}
              <span
                className={`scarce-clip-track-love-count${
                  loves.loveCountFor(active) > 0 ? '' : ' is-empty'
                }`}
              >
                {loves.loveCountFor(active) > 0
                  ? loves.loveCountFor(active)
                  : 0}
              </span>
            </button>
          ) : null}
          <MediaDownloadControl
            className="scarce-clip-download-control"
            glyph="save"
            ariaLabel="Save track to Files"
            disabled={
              downloadLock != null && downloadLock !== 'save-single'
            }
            onBusyChange={(busy) =>
              setDownloadLock(busy ? 'save-single' : null)
            }
            onDownload={async (onProgress) => {
              const track = playlist[activeIndex] ?? playlist[0];
              if (!track) return;
              try {
                await downloadIpfsMedia({
                  cid: track.cid,
                  url: track.url,
                  mime: track.mime,
                  title: track.title,
                  fallbackName: `track-${activeIndex + 1}`,
                  onProgress,
                  exportFile: true,
                });
              } catch (cause) {
                reportOfflineError(cause, txToastError.offlineCacheFailed);
                throw cause;
              }
            }}
          />
          {offlineAllowed || offlineUnknown ? (
            <MediaDownloadControl
              className="scarce-clip-download-control"
              ariaLabel="Download track"
              cached={
                offlineAllowed &&
                Boolean(
                  trackCidFromPlayable(active) &&
                    cachedCids.has(trackCidFromPlayable(active)!)
                )
              }
              disabled={
                offlineUnknown ||
                (downloadLock != null && downloadLock !== 'single')
              }
              onBusyChange={(busy) => setDownloadLock(busy ? 'single' : null)}
              onRemove={
                offlineAllowed
                  ? async () => {
                      const cid = trackCidFromPlayable(active);
                      if (!cid) return;
                      try {
                        await removeTrack(cid);
                        setCachedCids((current) => {
                          const next = new Set(current);
                          next.delete(cid);
                          return next;
                        });
                      } catch (cause) {
                        reportOfflineError(
                          cause,
                          txToastError.offlineRemoveFailed
                        );
                      }
                    }
                  : undefined
              }
              onDownload={async (onProgress) => {
                const track = playlist[activeIndex] ?? playlist[0];
                if (!track) return;
                try {
                  await downloadIpfsMedia({
                    cid: track.cid,
                    url: track.url,
                    mime: track.mime,
                    title: track.title,
                    fallbackName: `track-${activeIndex + 1}`,
                    onProgress,
                    cacheOffline: Boolean(persist?.collectionId),
                    exportFile: false,
                    onOfflineCache: async ({ cid, mime, blob }) => {
                      await cacheOfflineBytes({ cid, mime, blob, track });
                    },
                  });
                } catch (cause) {
                  reportOfflineError(cause, txToastError.offlineCacheFailed);
                  throw cause;
                }
              }}
            />
          ) : null}
          {persist?.collectionId ? (
            <ScarceClipShareButton
              className="scarce-clip-download-control"
              title={persist.title}
              collectionId={persist.collectionId}
              mediaUrl={poster}
              mediumKind="audio"
            />
          ) : null}
        </div>
      ) : null}

      {hasLyrics && !listenOpen ? (
        <div className="scarce-clip-lyrics">
          <button
            type="button"
            className={`scarce-clip-lyrics-toggle${lyricsOpen ? ' is-open' : ''}`}
            aria-expanded={lyricsOpen}
            aria-controls="scarce-clip-lyrics-panel"
            onClick={() => setLyricsOpen((open) => !open)}
          >
            {lyricsOpen ? 'Hide lyrics' : 'Lyrics'}
          </button>
          {lyricsOpen ? (
            <pre
              id="scarce-clip-lyrics-panel"
              className="scarce-clip-lyrics-body"
            >
              {activeLyrics}
            </pre>
          ) : null}
        </div>
      ) : null}

      {!tracksOnly && isAudio ? (
        <ScarceClipListenSheet
          open={listenOpen}
          onClose={() => {
            setListenOpen(false);
            onListenClose?.();
          }}
          cover={cover}
          albumTitle={persist?.title?.trim() || 'Drop'}
          trackTitle={active.title?.trim() || persist?.title?.trim() || 'Track'}
          playing={playing}
          hasLyrics={hasLyrics}
          lyricsOpen={lyricsOpen}
          lyrics={activeLyrics}
          canPrev={!playDisabled}
          canNext={!playDisabled && canSelectIndex(activeIndex + 1)}
          playDisabled={playDisabled}
          scrubbing={scrubbing}
          knobPeek={knobPeek}
          duration={duration}
          elapsedRef={listenElapsedRef}
          railRef={listenRailRef}
          scrubInputRef={listenScrubInputRef}
          shareTitle={persist?.collectionId ? persist.title : null}
          shareCollectionId={persist?.collectionId ?? null}
          shareMediaUrl={cover}
          loved={loves.viewerLoves(active)}
          loveCount={loves.loveCountFor(active)}
          lovePending={loves.isLovePending(active)}
          onToggleLove={
            persist?.collectionId && creatorId
              ? () => {
                  void loves.toggleLove(active);
                }
              : null
          }
          onTogglePlay={() => {
            void togglePlayback();
          }}
          onSkip={(delta) => {
            if (delta < 0) skipPrevious();
            else skipNext();
          }}
          onLyricsOpenChange={setLyricsOpen}
          onScrubPointerDown={(clientX, rail) => {
            if (durationRef.current <= 0) return;
            activeScrubRailRef.current = rail;
            beginScrub();
            previewScrub(timeFromClientX(clientX));
          }}
          onScrubPointerMove={(clientX) => {
            if (!scrubbingRef.current) return;
            previewScrub(timeFromClientX(clientX));
          }}
          onScrubPointerUp={(clientX) => {
            endScrub(timeFromClientX(clientX));
          }}
          onScrubPointerCancel={(clientX) => {
            endScrub(timeFromClientX(clientX));
          }}
          onScrubChange={(value) => {
            if (scrubbingRef.current) return;
            const media = mediaRef.current;
            const capped = clampTime(value);
            if (media) media.currentTime = capped;
            paintProgress(capped);
            showKnobPeek(1100);
          }}
          onProgressPointerEnter={() => {
            clearKnobPeekTimer();
            setKnobPeek(true);
          }}
          onProgressPointerLeave={() => {
            if (!scrubbingRef.current) showKnobPeek(1100);
          }}
          footer={listenFooter}
        />
      ) : null}
      <ScarceFansSheet
        open={fansOpen}
        onClose={() => setFansOpen(false)}
        fanIds={loves.fanIds}
        fanCount={loves.fanCount}
        dropTitle={persist?.title}
      />
    </div>
  );
}
