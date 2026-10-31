'use client';

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import type { PostRow } from '@onsocial/sdk';
import {
  HeartFillIcon,
  HeartIcon,
  NextFillIcon,
  PauseFillIcon,
  PlayFillIcon,
  PreviousFillIcon,
  ScaleUpIcon,
  ipfsImgSrcSet,
} from '@onsocial/ui';
import { MediaDownloadControl } from '@/components/ui/media-download-control';
import { SCARCE_HERO_WIDTHS, SQUARE_ART_SIZES } from '@/lib/hero-img-variants';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useCollectiblesNowPlayingOptional } from '@/contexts/collectibles-now-playing-context';
import {
  mediaFacesYieldedNow,
  onResumeMediaFace,
  useMediaFaceCoverEpoch,
  useMediaFacesHeld,
  useMediaFacesYielded,
} from '@/lib/media-face-session';
import {
  feedCoverOpenIntent,
  heldSiblingPlayhead,
  mediaDisplayedPlayhead,
  mediaElementIsDockHost,
  mediaFaceCoveredBySheet,
  mediaFaceIsForeground,
  noteMediaPlayhead,
  notifyDockBorrow,
  shouldPlaceSiblingPlayhead,
  reclaimSpeakersForLauncher,
  SPEAKER_RELOADING_ATTR,
  startJoinedMedia,
  topReplySheetZ,
} from '@/lib/single-media-playback';
import {
  dockSrcMatchesTrack,
  shouldBindPlaybackSession,
  shouldTakeOverPlayback,
} from '@/features/scarces/scarce-playback-session';
import type { ScarcePlayableMedia } from '@/features/market/market-listings';
import { GuildFacepile } from '@/features/guilds/guild-facepile';
import { FeedAudioEnlarge } from '@/features/home/feed-audio-enlarge';
import { usePostLayerOwnerZ } from '@/features/home/post-layer-owner-z';
import { postLayerOverlayZ } from '@/lib/sheet-z';
import { ClipProgressTrack } from '@/features/home/feed-media-progress';
import { ScarceClipListenSheet } from '@/features/scarces/scarce-clip-listen-sheet';
import { ScarceClipShareButton } from '@/features/scarces/scarce-clip-share-button';
import { ScarceFansSheet } from '@/features/scarces/scarce-fans-sheet';
import { ScarceTrackOptionsMenu } from '@/features/scarces/scarce-track-options-menu';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { useScarceTrackLoves } from '@/hooks/use-scarce-track-loves';
import { useScarceCollectionSaves } from '@/hooks/use-scarce-collection-saves';
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

/** Painted z of this film. A yielded face reports 0, so the last real z wins. */
function paintedSlideZ(
  node: HTMLMediaElement | null,
  fallback: number
): number {
  const slide = node?.closest('[data-os-slide-over="true"]');
  if (!(slide instanceof HTMLElement)) return fallback;
  const z = Number(getComputedStyle(slide).zIndex);
  if (!Number.isFinite(z) || z <= 0) return fallback;
  return Math.max(fallback, z);
}

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
  persist?: {
    collectionId: string;
    title: string;
    creatorId?: string | null;
    seriesId?: string | null;
    seriesTitle?: string | null;
    audioFormat?: 'single' | 'album' | 'podcast' | 'audiobook' | null;
    facets?: string[];
  } | null;
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
   * Mint/Buy/Bid sheets — compact cover (same footprint as ScarceBuyCover),
   * play + expand listen, no tracklist / download chrome.
   */
  commerce?: boolean;
  /**
   * When false, share cluster omits “Post” (Drop page — Post lives in dock).
   * Default true for Collectibles play / listen.
   */
  showFeedPost?: boolean;
  /** Link share in player chrome. Drop page keeps share next to bookmark. */
  showShare?: boolean;
  /** Save-to-device / offline download chrome. Drop page leaves this to play. */
  showDownloads?: boolean;
  /**
   * Open full-screen listen immediately and hide the compact cover shell
   * (post-origin enlarge). Closing listen calls `onListenClose`.
   */
  immersiveListen?: boolean;
  /**
   * Feed post: cover enlarge first (same face as video). The listen sheet
   * opens from that face. Back from the player returns to the cover.
   */
  feedEnlarge?: boolean;
  peekIdentity?: ReactNode;
  caption?: string | null;
  captionDate?: string | null;
  /** Jacket ⋯ on the feed cover face. */
  enlargeTrailing?: ReactNode;
  /** Mint/Buy + post engagement under love/share in listen mode. */
  listenFooter?: ReactNode;
  /**
   * Expanded listen tucks the launcher. Feed passes this true only after Reply.
   */
  listenKeepDock?: boolean;
  onListenClose?: () => void;
  /** Feed reply drawer over listen. Omitted on the Drop page player. */
  threadOpen?: boolean;
  onDismissThread?: () => void;
  threadAuthor?: string | null;
  threadPostId?: string | null;
  threadRoot?: PostRow | null;
  /**
   * The cover was tapped while this face was already open.
   * Play on from the paused place and take the speakers back.
   */
  coverPlayNonce?: number;
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
  commerce = false,
  showFeedPost = true,
  showShare = true,
  showDownloads = true,
  immersiveListen = false,
  feedEnlarge = false,
  peekIdentity = null,
  caption = null,
  captionDate = null,
  enlargeTrailing = null,
  listenFooter = null,
  listenKeepDock = false,
  onListenClose,
  threadOpen = false,
  onDismissThread,
  threadAuthor = null,
  threadPostId = null,
  threadRoot = null,
  coverPlayNonce = 0,
}: ScarceClipPlayerProps) {
  const nowPlaying = useCollectiblesNowPlayingOptional();
  const { setTxResult } = useAppTransactionFeedback();
  const browserOnline = useBrowserOnline();
  const hostSession =
    persist?.collectionId &&
    nowPlaying?.session?.collectionId === persist.collectionId
      ? nowPlaying.session
      : null;
  // Prefer the live album list when Buy/Sell only hydrated a single playable.
  const playlist = (() => {
    const local =
      tracks && tracks.length > 0 ? tracks : ([clip] as ScarcePlayableMedia[]);
    // A feed post plays its own tracks. It does not follow the launcher album.
    if (feedEnlarge) return local;
    if (hostSession && hostSession.tracks.length > local.length) {
      return hostSession.tracks;
    }
    return local;
  })();
  const [activeIndex, setActiveIndex] = useState(() => {
    if (feedEnlarge) return 0;
    // Join an in-flight album session on the same collection — don't flash track 1.
    if (hostSession) return nowPlaying!.activeIndex;
    return 0;
  });
  const active = playlist[Math.min(activeIndex, playlist.length - 1)] ?? clip;
  const isAudio = isRenderablePostAudioMime(active.mime);
  const sessionId = nowPlaying?.session?.collectionId ?? null;
  const persistId = persist?.collectionId?.trim() || null;
  // A collection, drop, or profile player may claim the launcher.
  // A feed cover, reply, or video never does. It pauses the song and plays alone.
  const persistMode = feedEnlarge
    ? false
    : shouldBindPlaybackSession({
        hasNowPlaying: Boolean(nowPlaying),
        persistId,
        sessionId,
        isAudio,
      });
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
  const faceRailRef = useRef<HTMLDivElement | null>(null);
  const faceElapsedRef = useRef<HTMLSpanElement | null>(null);
  const faceScrubInputRef = useRef<HTMLInputElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const facesHeld = useMediaFacesHeld();
  const facesYielded = useMediaFacesYielded();
  const coverEpoch = useMediaFaceCoverEpoch();
  const faceOwnerId = useId();
  const requestedFaceZ = postLayerOverlayZ(usePostLayerOwnerZ()).face;
  const [paintedFaceZ, setPaintedFaceZ] = useState(requestedFaceZ);
  if (requestedFaceZ > paintedFaceZ) setPaintedFaceZ(requestedFaceZ);
  // The slide-over reports its painted z from a child layout effect, which
  // runs before this player's hold. The ref is current in that same commit.
  const paintedFaceZRef = useRef(requestedFaceZ);
  if (requestedFaceZ > paintedFaceZRef.current) {
    paintedFaceZRef.current = requestedFaceZ;
  }
  /** This reply pause was ours. Back onto the post continues from here. */
  const resumeAfterReplyRef = useRef(false);
  const replySheetZ =
    typeof document === 'undefined' ? null : topReplySheetZ(document);
  const liveFaceZ = paintedSlideZ(
    mediaRef.current,
    Math.max(paintedFaceZ, paintedFaceZRef.current)
  );
  const faceSteppedAside =
    facesYielded &&
    !mediaFaceCoveredBySheet({
      held: true,
      faceZ: liveFaceZ,
      sheetZ: replySheetZ,
    });
  const [started, setStarted] = useState(false);
  /** Bump to autoplay after a track change (tap or natural advance). */
  const [autoplayNonce, setAutoplayNonce] = useState(0);
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [listenOpen, setListenOpen] = useState(immersiveListen && !feedEnlarge);
  const [chromeVisible, setChromeVisible] = useState(true);
  const chromeHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [downloadLock, setDownloadLock] = useState<string | null>(null);
  const [cachedCids, setCachedCids] = useState<Set<string>>(() => new Set());
  const [localSrc, setLocalSrc] = useState(active.url);
  const [duration, setDuration] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
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
  }, [listenOpen]);

  useEffect(() => {
    if (feedEnlarge) return;
    if (immersiveListen) setListenOpen(true);
  }, [feedEnlarge, immersiveListen]);

  // Same open as video. This post plays on its own element and pauses the
  // launcher, even when the post is the same album. Closing stops only this post.
  useLayoutEffect(() => {
    if (!feedEnlarge) return;
    const track = playlist[activeIndex] ?? clip;
    if (!track?.url) return;
    const audio = mediaRef.current;
    if (!audio || mediaElementIsDockHost(audio)) return;
    if (!dockSrcMatchesTrack(audio, track)) {
      audio.src = track.url;
      audio.load();
    }
    audio.muted = false;
    audio.volume = 1;
    let cancelled = false;
    // A fresh post starts at 0. A sibling a reply already paused continues.
    const held = heldSiblingPlayhead(audio);
    const intent = feedCoverOpenIntent(held);
    const place = () => {
      if (cancelled || intent !== 'explicit') return;
      const next = heldSiblingPlayhead(audio);
      // Metadata can land after a rewind. Only a copy still at 0 takes the clock.
      if (!shouldPlaceSiblingPlayhead(audio.currentTime, next)) return;
      try {
        audio.currentTime = next;
      } catch {
        // Metadata can land after this.
      }
    };
    place();
    if (intent === 'explicit') {
      audio.addEventListener('loadedmetadata', place);
    }
    void startJoinedMedia(audio, intent)
      .then(() => {
        if (!cancelled) setPlaying(true);
      })
      .catch(() => {
        if (!cancelled) setPlaying(false);
      });
    return () => {
      cancelled = true;
      audio.removeEventListener('loadedmetadata', place);
      notifyDockBorrow(audio, 'stop');
      audio.pause();
    };
    // Open once. Track changes go through selectTrack.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- feed open only
  }, [feedEnlarge]);

  // A reply is a normal pause, so the launcher starts.
  // Back onto this post plays on from the same place. The reply drawer can stay open.
  useLayoutEffect(() => {
    if (!feedEnlarge) return;
    const audio = mediaRef.current;
    if (!audio || mediaElementIsDockHost(audio)) return;
    // The sound stays in the card, so a hidden film is not "behind" this
    // element. While this film has stepped aside, keep it paused. A play
    // that was already in flight must not start it again under the reply.
    if (faceSteppedAside) {
      const stop = () => {
        // A cover tap already cleared the hide. That play is the film coming back.
        if (!mediaFacesYieldedNow()) return;
        if (audio.paused || audio.ended) return;
        resumeAfterReplyRef.current = true;
        audio.pause();
      };
      stop();
      audio.addEventListener('play', stop);
      return () => audio.removeEventListener('play', stop);
    }
    const sheetZ =
      typeof document === 'undefined' ? null : topReplySheetZ(document);
    const faceZ = paintedSlideZ(
      audio,
      Math.max(paintedFaceZ, paintedFaceZRef.current)
    );
    const steppedAside =
      facesYielded &&
      !mediaFaceCoveredBySheet({ held: true, faceZ, sheetZ });
    const covered = mediaFaceCoveredBySheet({
      held: facesHeld,
      faceZ,
      sheetZ,
      // Hidden until back shows this film, even if the sheet z is not known yet.
      yielded: facesYielded || steppedAside,
    });
    const foreground = mediaFaceIsForeground(audio);
    if (!foreground || covered) {
      if (!audio.paused && !audio.ended) {
        resumeAfterReplyRef.current = true;
        audio.pause();
      }
      return;
    }
    if (!resumeAfterReplyRef.current || audio.ended || !audio.isConnected) {
      return;
    }
    if (
      audio
        .closest('[data-os-slide-over="true"]')
        ?.classList.contains('is-closing')
    ) {
      resumeAfterReplyRef.current = false;
      return;
    }
    if (!audio.paused) {
      resumeAfterReplyRef.current = false;
      return;
    }
    resumeAfterReplyRef.current = false;
    void startJoinedMedia(audio, 'explicit')
      .then(() => setPlaying(true))
      .catch(() => setPlaying(false));
    // coverEpoch: a later reply moved over this face without facesHeld flipping.
    void coverEpoch;
  }, [
    coverEpoch,
    faceSteppedAside,
    facesHeld,
    facesYielded,
    feedEnlarge,
    paintedFaceZ,
  ]);

  useLayoutEffect(() => {
    if (!coverPlayNonce || !feedEnlarge) return;
    const audio = mediaRef.current;
    if (!audio || mediaElementIsDockHost(audio)) return;
    void startJoinedMedia(audio, 'explicit')
      .then(() => setPlaying(true))
      .catch(() => setPlaying(false));
  }, [coverPlayNonce, feedEnlarge]);

  // A cover on another copy of this post shows this film and plays it.
  // The sound element stays in the card, so match the film we rendered.
  useEffect(() => {
    return onResumeMediaFace((face) => {
      if (face.getAttribute('data-os-face-owner') !== faceOwnerId) return;
      const audio = mediaRef.current;
      if (!audio || mediaElementIsDockHost(audio)) return;
      audio.muted = false;
      audio.volume = 1;
      void startJoinedMedia(audio, 'explicit')
        .then(() => setPlaying(true))
        .catch(() => setPlaying(false));
    });
  }, [faceOwnerId]);

  const playlistKey = playlist.map((t) => t.url).join('\0');
  const loves = useScarceTrackLoves({
    creatorId,
    collectionId: persist?.collectionId,
    tracks: playlist,
  });
  const collectionSaves = useScarceCollectionSaves({
    collectionIds: persist?.collectionId ? [persist.collectionId] : [],
    onError: (message) => setTxResult({ type: 'error', msg: message }),
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
    if (feedEnlarge || !persistMode || !persist || !ensureSession) return;
    ensureSession({
      collectionId: persist.collectionId,
      title: persist.title,
      poster: poster?.trim() || null,
      tracks: playlist,
    });
    // playlist identity is tracked via playlistKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    feedEnlarge,
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
    if (persistMode || feedEnlarge) return;
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
    feedEnlarge,
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
    for (const rail of [
      railRef.current,
      listenRailRef.current,
      faceRailRef.current,
    ]) {
      rail?.style.setProperty('--scarce-clip-p', stamped);
    }
    for (const elapsed of [
      elapsedRef.current,
      listenElapsedRef.current,
      faceElapsedRef.current,
    ]) {
      if (elapsed) elapsed.textContent = label;
    }
    for (const input of [
      scrubInputRef.current,
      listenScrubInputRef.current,
      faceScrubInputRef.current,
    ]) {
      if (!input) continue;
      input.value = String(time);
      input.setAttribute('aria-valuetext', label);
    }
  }

  /** Preview only — never touch media.currentTime while dragging (avoids rewind audio). */
  function previewScrub(next: number) {
    paintProgress(clampTime(next));
  }

  function beginScrub() {
    if (scrubbingRef.current) return;
    scrubbingRef.current = true;
    setScrubbing(true);
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
      noteMediaPlayhead(media, target);
    }
    paintProgress(target);
    scrubbingRef.current = false;
    setScrubbing(false);
    // Drop pointer focus so the knob can hide (keyboard still uses :focus-visible).
    scrubInputRef.current?.blur();
    listenScrubInputRef.current?.blur();
    faceScrubInputRef.current?.blur();
    if (resumeAfterScrubRef.current && media) {
      resumeAfterScrubRef.current = false;
      void startJoinedMedia(media, 'explicit')
        .then(() => setPlaying(true))
        .catch(() => setPlaying(false));
    } else {
      resumeAfterScrubRef.current = false;
    }
  }

  /** Release commits. Keyboard seeks immediately — there is no drag to preview. */
  function commitScrub(time: number) {
    if (scrubbingRef.current) {
      endScrub(time);
      return;
    }
    const media = mediaRef.current;
    const capped = clampTime(time);
    if (media) {
      media.currentTime = capped;
      noteMediaPlayhead(media, capped);
    }
    paintProgress(capped);
  }

  useEffect(() => {
    if (autoplayNonce === 0) return;
    if (persistMode && setHostTrack) {
      setHostTrack(activeIndex, true);
      return;
    }
    const media = mediaRef.current;
    if (!media || mediaElementIsDockHost(media)) return;
    if (!active.url) return;
    const track = { url: active.url, cid: active.cid };
    let cancelled = false;
    if (!media.paused) media.setAttribute(SPEAKER_RELOADING_ATTR, '');
    if (!dockSrcMatchesTrack(media, track)) {
      media.src = track.url;
    }
    media.muted = false;
    media.volume = 1;
    // Same <audio> node across tracks — force load so src swaps don't stall.
    media.load();
    void startJoinedMedia(media, feedEnlarge ? 'restart' : 'explicit')
      .then(() => {
        media.removeAttribute(SPEAKER_RELOADING_ATTR);
        if (!cancelled) setPlaying(true);
      })
      .catch(() => {
        media.removeAttribute(SPEAKER_RELOADING_ATTR);
        if (!cancelled) setPlaying(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    active.cid,
    active.url,
    activeIndex,
    autoplayNonce,
    feedEnlarge,
    persistMode,
    setHostTrack,
  ]);

  // Smooth playhead — DOM paint only, no setState (avoids tick from re-render).
  useEffect(() => {
    if (!playing || scrubbing || !isAudio) return;
    let raf = 0;
    const tick = () => {
      const media = mediaRef.current;
      if (media && !scrubbingRef.current) {
        const total = media.duration;
        paintProgress(
          mediaDisplayedPlayhead(media),
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
      const media = mediaRef.current;
      if (media instanceof HTMLVideoElement) media.pause();
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
    paintProgress(mediaDisplayedPlayhead(event.currentTarget));
  }

  function onLoadedMetadata(event: SyntheticEvent<HTMLMediaElement>) {
    const media = event.currentTarget;
    rememberDuration(active.url, media.duration);
    if (!scrubbingRef.current) {
      paintProgress(mediaDisplayedPlayhead(media), media.duration);
    }
  }

  function takeOverPlayback(index: number): boolean {
    // Opening a post borrows the speakers. Play on that face must not
    // replace the song already in the launcher.
    if (feedEnlarge) return false;
    if (!persist || !nowPlaying) return false;
    if (
      !shouldTakeOverPlayback({
        sessionId: nowPlaying.session?.collectionId ?? null,
        surfaceId: persist.collectionId,
        isAudio,
      })
    ) {
      return false;
    }
    nowPlaying.playSession({
      collectionId: persist.collectionId,
      title: persist.title,
      poster: poster?.trim() || null,
      tracks: playlist,
      startIndex: index,
    });
    return true;
  }

  async function togglePlayback() {
    if (restrictToCached) {
      const cid = trackCidFromPlayable(active);
      if (!cid || !cachedCids.has(cid)) return;
    }
    if (takeOverPlayback(activeIndex)) return;
    const media =
      mediaRef.current ??
      (persistMode && nowPlaying ? nowPlaying.getAudio() : null);
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
      if (mediaElementIsDockHost(media) && media.ownerDocument) {
        reclaimSpeakersForLauncher(media.ownerDocument);
      }
      await startJoinedMedia(media, 'explicit');
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
    if (takeOverPlayback(index)) return;
    const next = playlist[index];
    const cached = next ? durationByUrlRef.current.get(next.url) : undefined;
    // Point the post's own element at the next file before React commits,
    // so the swap pause is not treated as the post ending.
    if (!persistMode && next?.url) {
      const media = mediaRef.current;
      if (media && !mediaElementIsDockHost(media) && !media.paused) {
        media.setAttribute(SPEAKER_RELOADING_ATTR, '');
      }
      setLocalSrc(next.url);
    }
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
  const coverSrcSet = ipfsImgSrcSet(cover, SCARCE_HERO_WIDTHS);
  const showTrackList = commerce
    ? false
    : (showTracks ?? (isAudio && (tracksOnly || playlist.length > 1)));
  const showTracksTransport = tracksOnly && showTransport && showProgress;
  const canDownloadAudio =
    showDownloads && !commerce && isAudio && playlist.length > 0;
  const albumCids = playlist
    .map((track) => trackCidFromPlayable(track))
    .filter((cid): cid is string => Boolean(cid));
  const albumCached = albumHasAllTracksCached(albumCids, cachedCids);
  const offlineAllowed = canKeepOffline === true;
  const offlineUnknown = canKeepOffline == null;
  const restrictToCached =
    Boolean(nowPlaying?.session?.localOnly) || browserOnline === false;
  const playDisabled =
    restrictToCached && !cachedCids.has(trackCidFromPlayable(active) ?? '');
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
      creatorId: persist.creatorId,
      seriesId: persist.seriesId,
      seriesTitle: persist.seriesTitle,
      audioFormat: persist.audioFormat,
      facets: persist.facets,
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

  const coverFace = feedEnlarge ? (
    <FeedAudioEnlarge
      open
      onBeforeClose={() => {
        // Pause in the click. The face animates out afterwards, and that
        // later unmount is too late for the launcher to start again.
        const audio = mediaRef.current;
        if (audio && !mediaElementIsDockHost(audio) && !audio.paused) {
          notifyDockBorrow(audio, 'stop');
          audio.pause();
        }
        return true;
      }}
      onClose={() => onListenClose?.()}
      onOpenPlayer={() => setListenOpen(true)}
      title={persist?.title?.trim() || 'Drop'}
      cover={cover}
      playing={playing}
      onTogglePlay={() => {
        void togglePlayback();
      }}
      canPrev={!playDisabled}
      canNext={!playDisabled && canSelectIndex(activeIndex + 1)}
      playDisabled={playDisabled}
      duration={duration}
      scrubbing={scrubbing}
      onSkip={(delta) => {
        if (delta < 0) skipPrevious();
        else skipNext();
      }}
      progressKey={active.url}
      onScrubStart={() => beginScrub()}
      onPreview={(time) => previewScrub(time)}
      onCommit={(time) => commitScrub(time)}
      faceRailRef={faceRailRef}
      faceElapsedRef={faceElapsedRef}
      faceScrubInputRef={faceScrubInputRef}
      yielded={faceSteppedAside}
      onPaintedZ={(z) => {
        paintedFaceZRef.current = z;
        setPaintedFaceZ((current) => (current === z ? current : z));
      }}
      peekIdentity={peekIdentity}
      caption={caption}
      captionDate={captionDate}
      footer={listenFooter}
      trailing={enlargeTrailing}
      threadOpen={Boolean(threadOpen) && !listenOpen}
      onDismissThread={onDismissThread}
      threadAuthor={threadAuthor}
      threadPostId={threadPostId}
      threadRoot={threadRoot}
      faceOwnerId={faceOwnerId}
    />
  ) : null;

  return (
    <>
      {coverFace}
      <div
        data-os-player-owner={faceOwnerId}
        className={`scarce-clip-player-shell${
          tracksOnly ? ' scarce-clip-player-shell--tracks' : ''
        }${isAudio ? ' scarce-clip-player-shell--audio' : ''}${
          commerce ? ' scarce-clip-player-shell--commerce' : ''
        }${
          immersiveListen || feedEnlarge
            ? ' scarce-clip-player-shell--immersive'
            : ''
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
              isAudio
                ? 'scarce-clip-player--audio'
                : 'scarce-clip-player--video',
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
                    <img
                      className="scarce-clip-player-cover"
                      src={cover}
                      srcSet={coverSrcSet}
                      sizes={coverSrcSet ? SQUARE_ART_SIZES : undefined}
                      alt=""
                      decoding="async"
                    />
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
                      <span
                        className="scarce-clip-player-play-icon"
                        aria-hidden
                      >
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
                    <ClipProgressTrack
                      railRef={railRef}
                      scrubRef={scrubInputRef}
                      duration={duration}
                      scrubbing={scrubbing}
                      progressKey={active.url}
                      onScrubStart={() => {
                        pokeChrome();
                        beginScrub();
                      }}
                      onPreview={(time) => previewScrub(time)}
                      onCommit={(time) => {
                        pokeChrome();
                        commitScrub(time);
                      }}
                    />
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
              {playlist.length > 1 && showDownloads ? (
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
                </>
              ) : null}
              {playlist.length > 1 && showShare && persist?.collectionId ? (
                <ScarceClipShareButton
                  className="scarce-clip-download-control"
                  title={persist.title}
                  collectionId={persist.collectionId}
                  mediaUrl={poster}
                  mediumKind="audio"
                  showFeedPost={showFeedPost}
                />
              ) : null}
            </div>
          </div>
        ) : null}

        {showTracksTransport ? (
          <div className="scarce-clip-transport">
            <button
              type="button"
              className="scarce-clip-transport-btn os-disabled-ink"
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
              className="scarce-clip-transport-btn os-disabled-ink scarce-clip-transport-btn--play"
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
              className="scarce-clip-transport-btn os-disabled-ink"
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
            <ClipProgressTrack
              railRef={railRef}
              scrubRef={scrubInputRef}
              duration={duration}
              scrubbing={scrubbing}
              progressKey={active.url}
              onScrubStart={() => beginScrub()}
              onPreview={(time) => previewScrub(time)}
              onCommit={(time) => commitScrub(time)}
            />
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
                {playlist.length > 1 && showDownloads ? (
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
                          await exportIpfsAlbumTracks(
                            downloadItems,
                            onProgress
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
                  </>
                ) : null}
                {playlist.length > 1 && showShare && persist?.collectionId ? (
                  <ScarceClipShareButton
                    className="scarce-clip-download-control"
                    title={persist.title}
                    collectionId={persist.collectionId}
                    mediaUrl={poster}
                    mediumKind="audio"
                    showFeedPost={showFeedPost}
                  />
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
                        className={`scarce-clip-track-love os-confirm-icon${
                          loved ? ' is-loved' : ''
                        }${lovePending ? ' is-pending' : ''}`}
                        aria-label={
                          lovePending
                            ? `Confirming love for ${label}`
                            : loved
                              ? `Unlove ${label}`
                              : `Love ${label}`
                        }
                        aria-pressed={loved}
                        aria-busy={lovePending}
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
                          className="scarce-clip-track-love-count"
                          aria-hidden={loveCount <= 0}
                        >
                          {loveCount > 0 ? loveCount : ''}
                        </span>
                      </button>
                    ) : null}
                    {showDownloads ? (
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
                    ) : null}
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
                className={`scarce-clip-track-love os-confirm-icon${
                  loves.viewerLoves(active) ? ' is-loved' : ''
                }${loves.isLovePending(active) ? ' is-pending' : ''}`}
                aria-label={
                  loves.isLovePending(active)
                    ? `Confirming love for ${active.title?.trim() || 'track'}`
                    : loves.viewerLoves(active)
                      ? `Unlove ${active.title?.trim() || 'track'}`
                      : `Love ${active.title?.trim() || 'track'}`
                }
                aria-pressed={loves.viewerLoves(active)}
                aria-busy={loves.isLovePending(active)}
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
                  <HeartIcon
                    className="scarce-clip-track-love-icon"
                    aria-hidden
                  />
                )}
                <span
                  className="scarce-clip-track-love-count"
                  aria-hidden={loves.loveCountFor(active) <= 0}
                >
                  {loves.loveCountFor(active) > 0
                    ? loves.loveCountFor(active)
                    : ''}
                </span>
              </button>
            ) : null}
            <MediaDownloadControl
              className="scarce-clip-download-control"
              glyph="save"
              ariaLabel="Save track to Files"
              disabled={downloadLock != null && downloadLock !== 'save-single'}
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
            {showShare && persist?.collectionId ? (
              <ScarceClipShareButton
                className="scarce-clip-download-control"
                title={persist.title}
                collectionId={persist.collectionId}
                mediaUrl={poster}
                mediumKind="audio"
                showFeedPost={showFeedPost}
              />
            ) : null}
          </div>
        ) : null}

        {hasLyrics && !listenOpen && !commerce ? (
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
              if (!feedEnlarge) onListenClose?.();
            }}
            cover={cover}
            albumTitle={persist?.title?.trim() || 'Drop'}
            trackTitle={
              active.title?.trim() || persist?.title?.trim() || 'Track'
            }
            playing={playing}
            hasLyrics={hasLyrics}
            lyricsOpen={lyricsOpen}
            lyrics={activeLyrics}
            canPrev={!playDisabled}
            canNext={!playDisabled && canSelectIndex(activeIndex + 1)}
            playDisabled={playDisabled}
            scrubbing={scrubbing}
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
            saved={
              persist?.collectionId
                ? collectionSaves.viewerSaved(persist.collectionId)
                : false
            }
            savePending={
              persist?.collectionId
                ? collectionSaves.isSavePending(persist.collectionId)
                : false
            }
            onToggleSave={
              persist?.collectionId
                ? () => {
                    void collectionSaves.toggleSave(persist.collectionId!);
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
            onScrubStart={() => beginScrub()}
            onPreview={(time) => previewScrub(time)}
            onCommit={(time) => commitScrub(time)}
            footer={listenFooter}
            keepDock={listenKeepDock}
            threadOpen={Boolean(threadOpen) && (!feedEnlarge || listenOpen)}
            onDismissThread={onDismissThread}
            threadAuthor={threadAuthor}
            threadPostId={threadPostId}
            threadRoot={threadRoot}
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
    </>
  );
}
