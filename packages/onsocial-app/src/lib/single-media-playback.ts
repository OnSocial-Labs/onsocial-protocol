/**
 * One post / clip playback at a time.
 *
 * A nested reply drawer mounts a second <video> or <audio> for a post that
 * is already playing under it. Passive autoplay must not start that copy.
 * An explicit tap takes the clock over instead of starting again at 0.
 * A muted list video must not cut off music that is already audible.
 *
 * A band reply drawer shares the media face. It sits under the film and is
 * not a cover of it. While that face player is still on screen, passive
 * autoplay in the drawer must not take the clock.
 */

export type SingleMediaIntent = 'passive' | 'explicit' | 'restart';

const HANDOFF_FLOOR_SEC = 0.35;

/** Hidden launcher element. Foreign media borrows it; this guard must not pause it. */
const DOCK_HOST_CLASS = 'collectibles-now-playing-host-audio';

export function mediaElementIsDockHost(node: HTMLMediaElement): boolean {
  return node.classList.contains(DOCK_HOST_CLASS);
}

/** The real launcher element, when it is mounted. */
export function launcherAudioElement(
  doc: Document | null | undefined
): HTMLAudioElement | null {
  if (!doc) return null;
  const node = doc.querySelector(`audio.${DOCK_HOST_CLASS}`);
  return node instanceof HTMLAudioElement ? node : null;
}

/**
 * An explicit post with sound borrows the launcher.
 * Muted pictures and the launcher itself do not.
 */
export function shouldBorrowSpeakers(opts: {
  intent: SingleMediaIntent;
  dockHost: boolean;
  muted: boolean;
  volume: number;
}): boolean {
  if (opts.intent === 'passive' || opts.dockHost) return false;
  return !opts.muted && opts.volume > 0;
}

type DockBorrowListener = (
  node: HTMLMediaElement,
  phase: 'start' | 'stop'
) => void;

let dockBorrowListener: DockBorrowListener | null = null;

/** The launcher registers this so a post can pause it before its play event. */
export function setDockBorrowListener(
  listener: DockBorrowListener | null
): void {
  dockBorrowListener = listener;
}

export function notifyDockBorrow(
  node: HTMLMediaElement,
  phase: 'start' | 'stop'
): void {
  dockBorrowListener?.(node, phase);
}

/**
 * The dock hold pauses the launcher when a post becomes audible, and resumes
 * it when that post goes quiet. Pausing the launcher here happens before the
 * play event, so the hold never records that it should resume.
 * Resuming the launcher must not stop a muted picture that is still on screen.
 */
export function shouldPauseForeignOwner(opts: {
  pauseOwner: boolean;
  incomingIsDockHost: boolean;
  ownerIsDockHost: boolean;
}): boolean {
  if (!opts.pauseOwner) return false;
  if (opts.ownerIsDockHost || opts.incomingIsDockHost) return false;
  return true;
}

/** Feed and detail pictures expose mute, not play. The launcher silences them. */
export const LAUNCHER_RECLAIM_EVENT = 'os-launcher-reclaim';

export type LauncherReclaim = 'keep' | 'pause' | 'mute';

/**
 * The launcher chip is an explicit ask for the song.
 * An audible post yields. A mute chip goes silent and keeps playing.
 * A play button pauses. The dock, a create-drop preview, and muted pictures stay.
 */
export function launcherReclaimFor(opts: {
  dockHost: boolean;
  dockBorrow: boolean;
  audible: boolean;
  soundChip: boolean;
}): LauncherReclaim {
  if (opts.dockHost || opts.dockBorrow || !opts.audible) return 'keep';
  if (opts.soundChip) return 'mute';
  return 'pause';
}

export function mediaElementIsAudible(node: HTMLMediaElement): boolean {
  return !node.muted && node.volume > 0 && !node.paused && !node.ended;
}

/** Set while a post is about to play, so the launcher does not resume underneath it. */
export const SPEAKER_CLAIM_ATTR = 'data-os-speaker-claim';

/**
 * Set only around a src reload of an element that is already playing.
 * That pause is not the post ending, so the launcher must not come back yet.
 */
export const SPEAKER_RELOADING_ATTR = 'data-os-speaker-reloading';

export function speakerIsReloading(node: HTMLMediaElement): boolean {
  return node.hasAttribute(SPEAKER_RELOADING_ATTR);
}

/**
 * A reply sheet pauses the film under it.
 * A cover opened from that reply paints above the sheet and should play.
 * Unknown stacking stays paused until both heights are known.
 */
export function mediaFaceCoveredBySheet(input: {
  held: boolean;
  faceZ: number | null;
  sheetZ: number | null;
  /** This film stepped aside for the reply already on screen. */
  yielded?: boolean;
}): boolean {
  if (!input.held) return false;
  if (input.yielded) return true;
  if (input.faceZ == null || input.sheetZ == null) return true;
  return input.faceZ <= input.sheetZ;
}

/** Continue an album the reply just covered. A fresh feed open starts at 0. */
export function feedCoverOpenIntent(
  heldSiblingTime: number
): SingleMediaIntent {
  return heldSiblingTime > HANDOFF_FLOOR_SEC ? 'explicit' : 'restart';
}

const TOP_REPLY_SHEET =
  '.glass-sheet-root.is-visible:not(.post-thread-sheet-parked):not(.glass-sheet-root--band):not(.is-closing)';

/**
 * Highest reply sheet. The band on a film is not a cover of that film.
 * A face opened above the sheet marks that sheet inert. It is still the
 * sheet, and its z is what says the face cleared it.
 */
export function topReplySheetZ(
  doc: Document | null | undefined
): number | null {
  if (!doc) return null;
  let top: number | null = null;
  doc.querySelectorAll(TOP_REPLY_SHEET).forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    if (node.getAttribute('aria-hidden') === 'true') return;
    if (node.style.visibility === 'hidden') return;
    const z = Number(getComputedStyle(node).zIndex);
    if (!Number.isFinite(z)) return;
    top = top == null ? z : Math.max(top, z);
  });
  return top;
}

/**
 * Where a new copy of this file should start.
 * No live post means a fresh open at 0, even if a listen was saved.
 * A saved time behind the latest copy is a manual rewind and wins.
 */
export function postContinuePlayhead(
  siblingTime: number,
  savedTime: number,
  rewound: boolean
): number {
  if (siblingTime <= HANDOFF_FLOOR_SEC) return 0;
  if (
    rewound &&
    savedTime > HANDOFF_FLOOR_SEC &&
    savedTime + 0.5 < siblingTime
  ) {
    return savedTime;
  }
  return siblingTime;
}

/** A copy still at the start may take the sibling clock. A rewind stays. */
export function shouldPlaceSiblingPlayhead(
  currentTime: number,
  held: number
): boolean {
  if (!(held > HANDOFF_FLOOR_SEC)) return false;
  return !Number.isFinite(currentTime) || currentTime <= HANDOFF_FLOOR_SEC;
}

/**
 * Playhead of another post with this file, so a face opened over a reply
 * can continue. The launcher keeps its own clock and is not that sibling.
 */
export function heldSiblingPlayhead(node: HTMLMediaElement): number {
  const key = mediaElementKey(node);
  if (!key) return 0;
  const doc = node.ownerDocument;
  let best = 0;
  doc?.querySelectorAll('audio, video').forEach((other) => {
    if (!(other instanceof HTMLMediaElement) || other === node) return;
    if (mediaElementIsDockHost(other)) return;
    if (mediaElementKey(other) !== key) return;
    if (other.currentTime > best) best = other.currentTime;
  });
  const rewound = rewoundTo.has(key);
  return postContinuePlayhead(
    best,
    rewound ? (rewoundTo.get(key) ?? 0) : (progress.get(key) ?? 0),
    rewound
  );
}

/**
 * Another audible player yields when a post explicitly starts.
 * The launcher and a create-drop preview are left for their own holds.
 */
export function shouldYieldToIncoming(opts: {
  incoming: boolean;
  dockHost: boolean;
  dockBorrow: boolean;
  audible: boolean;
}): boolean {
  if (opts.incoming || opts.dockHost || opts.dockBorrow) return false;
  return opts.audible;
}

export function speakerClaimPending(root: ParentNode): boolean {
  return root.querySelector(`[${SPEAKER_CLAIM_ATTR}]`) != null;
}

/** Pause every other audible post before this one plays. */
export function yieldSpeakersTo(incoming: HTMLMediaElement): void {
  const root = incoming.ownerDocument;
  if (!root) return;
  root.querySelectorAll('video, audio').forEach((node) => {
    if (!(node instanceof HTMLMediaElement)) return;
    if (
      !shouldYieldToIncoming({
        incoming: node === incoming,
        dockHost: mediaElementIsDockHost(node),
        dockBorrow: node.dataset.osDockBorrow != null,
        audible: mediaElementIsAudible(node),
      })
    ) {
      return;
    }
    node.pause();
  });
}

/** Stop every other audible player before the launcher song starts. */
export function reclaimSpeakersForLauncher(root: ParentNode): void {
  root.querySelectorAll('video, audio').forEach((node) => {
    if (!(node instanceof HTMLMediaElement)) return;
    const action = launcherReclaimFor({
      dockHost: mediaElementIsDockHost(node),
      dockBorrow: node.dataset.osDockBorrow != null,
      audible: mediaElementIsAudible(node),
      soundChip: node.dataset.osSoundChip != null,
    });
    if (action === 'pause') {
      node.pause();
      return;
    }
    if (action !== 'mute') return;
    node.muted = true;
    delete node.dataset.osListSound;
    node.dispatchEvent(new Event(LAUNCHER_RECLAIM_EVENT));
  });
}

export type SingleMediaOwnerView = {
  sameElement: boolean;
  sameKey: boolean;
  /** Playing, connected, and not under a parked sheet or a covering drawer. */
  active: boolean;
  /** Unmuted and active. */
  audible: boolean;
  /** The element has not been paused, even if a drawer is covering it. */
  playing: boolean;
  time: number;
  /**
   * Enlarged face player still on screen. Passive copies stay quiet until
   * the viewer taps one or a real cover hides the face.
   */
  stage: boolean;
};

export function resolveSingleMediaPlayback(input: {
  intent: SingleMediaIntent;
  /** This element sits under a parked trail sheet or a covering drawer. */
  selfQuiet: boolean;
  selfMuted: boolean;
  /** Still at the start, so a handoff may seek. */
  atStart: boolean;
  savedTime: number;
  owner: SingleMediaOwnerView | null;
}): { allow: boolean; pauseOwner: boolean; seekTo: number | null } {
  const owner = input.owner;
  const seekSaved =
    input.intent !== 'restart' &&
    input.atStart &&
    input.savedTime > HANDOFF_FLOOR_SEC
      ? input.savedTime
      : null;

  if (!owner || owner.sameElement) {
    if (input.selfQuiet && input.intent === 'passive') {
      return { allow: false, pauseOwner: false, seekTo: null };
    }
    // The caller already placed this element (scrub to the start, replay).
    const seekTo = input.intent === 'passive' ? seekSaved : null;
    return { allow: true, pauseOwner: false, seekTo };
  }

  if (input.selfQuiet && input.intent === 'passive') {
    return { allow: false, pauseOwner: false, seekTo: null };
  }

  // The enlarged film keeps the clock while it is still on screen.
  // Scrolling a reply into the band underneath must not start another copy.
  if (owner.stage && input.intent === 'passive') {
    return { allow: false, pauseOwner: false, seekTo: null };
  }

  // Same file is already playing where the viewer can hear or see it.
  if (owner.sameKey && owner.active && input.intent === 'passive') {
    return { allow: false, pauseOwner: false, seekTo: null };
  }

  // Silent autoplay must not cut off sound that is already going.
  if (
    !owner.sameKey &&
    owner.audible &&
    input.selfMuted &&
    input.intent === 'passive'
  ) {
    return { allow: false, pauseOwner: false, seekTo: null };
  }

  const handoffTime =
    owner.sameKey && owner.time > HANDOFF_FLOOR_SEC
      ? owner.time
      : input.savedTime;
  const seekTo =
    input.intent !== 'restart' &&
    input.atStart &&
    handoffTime > HANDOFF_FLOOR_SEC &&
    owner.sameKey
      ? handoffTime
      : seekSaved;

  return {
    allow: true,
    pauseOwner: owner.playing,
    seekTo,
  };
}

type Owner = {
  node: HTMLMediaElement;
  key: string;
};

let owner: Owner | null = null;
const progress = new Map<string, number>();
/** File whose playhead was set by a scrub. A later copy must not jump past it. */
const rewoundTo = new Map<string, number>();

export function resetSingleMediaPlaybackForTests(): void {
  owner = null;
  progress.clear();
  rewoundTo.clear();
}

export function mediaElementKey(node: HTMLMediaElement): string {
  const attr = node.getAttribute('src')?.trim();
  if (attr) return attr;
  const current = node.currentSrc?.trim();
  if (current) return current;
  const source = node.querySelector('source')?.getAttribute('src')?.trim();
  return source || '';
}

function readIntent(node: HTMLMediaElement): SingleMediaIntent {
  const raw = node.dataset.osMediaIntent;
  delete node.dataset.osMediaIntent;
  if (raw === 'explicit' || raw === 'restart') return raw;
  return 'passive';
}

export type MediaCoverFact = {
  containsNode: boolean;
  /** Bottom band on a media face. Shares the stage; does not cover the film. */
  band: boolean;
  inert: boolean;
  hidden: boolean;
  /** The cover's box intersects the media box. */
  overlaps: boolean;
};

/**
 * Topmost real cover wins. A band drawer is not a cover. A sheet that does
 * not overlap this element is not a cover of it either.
 * `covers` is topmost first.
 */
export function mediaIsQuietUnderCovers(input: {
  connected: boolean;
  parkedOrCoveredFeed: boolean;
  covers: readonly MediaCoverFact[];
}): boolean {
  if (!input.connected) return true;
  if (input.parkedOrCoveredFeed) return true;
  for (const cover of input.covers) {
    if (cover.inert || cover.hidden || cover.band) continue;
    if (cover.containsNode) return false;
    if (!cover.overlaps) continue;
    return true;
  }
  return false;
}

function coverOverlapsMedia(cover: DOMRect, node: DOMRect): boolean {
  if (node.width <= 0 || node.height <= 0) return true;
  if (cover.width <= 0 || cover.height <= 0) return false;
  return (
    cover.left < node.right &&
    cover.right > node.left &&
    cover.top < node.bottom &&
    cover.bottom > node.top
  );
}

/** Enlarged film on the media face, not a list copy inside the reply band. */
function mediaElementIsStage(node: HTMLMediaElement): boolean {
  return node.closest('.feed-photo-stage') != null;
}

/** Covered by a parked trail sheet, a kept feed, or a drawer above this node. */
export function mediaElementIsQuiet(node: HTMLMediaElement): boolean {
  // The launcher has no box. A 0-size element counts as covered by every
  // open sheet, which would reject the resume while the post is still up.
  if (mediaElementIsDockHost(node)) return false;
  const doc = node.ownerDocument;
  const covers: MediaCoverFact[] = [];
  if (doc && node.isConnected) {
    const nodes = doc.querySelectorAll(
      '.glass-sheet-root:not(.post-thread-sheet-parked), [data-os-slide-over="true"]:not(.is-closing)'
    );
    const nodeRect = node.getBoundingClientRect();
    for (let index = nodes.length - 1; index >= 0; index -= 1) {
      const cover = nodes[index];
      if (!(cover instanceof HTMLElement)) continue;
      covers.push({
        containsNode: cover.contains(node),
        band: cover.classList.contains('glass-sheet-root--band'),
        inert: cover.inert,
        hidden:
          cover.getAttribute('aria-hidden') === 'true' ||
          cover.style.visibility === 'hidden',
        overlaps: coverOverlapsMedia(cover.getBoundingClientRect(), nodeRect),
      });
    }
  }
  return mediaIsQuietUnderCovers({
    connected: node.isConnected,
    parkedOrCoveredFeed: Boolean(
      node.closest('.post-thread-sheet-parked, [data-feed-session="covered"]')
    ),
    covers,
  });
}

function remember(node: HTMLMediaElement) {
  // The launcher clock is not the post's. A seek still in flight would
  // store the time from before the rewind.
  if (mediaElementIsDockHost(node) || node.seeking) return;
  const pending = playheadFix.get(node);
  if (pending != null && Math.abs(node.currentTime - pending) > 0.5) return;
  const key = mediaElementKey(node);
  if (!key || !Number.isFinite(node.currentTime)) return;
  const prev = progress.get(key) ?? 0;
  if (node.currentTime < HANDOFF_FLOOR_SEC && prev > HANDOFF_FLOOR_SEC) return;
  progress.set(key, node.currentTime);
  const pinned = rewoundTo.get(key);
  // Follow the scrub forward. A later copy must not pull it back.
  if (pinned != null && node.currentTime > pinned) {
    rewoundTo.set(key, node.currentTime);
  }
}

const playheadFix = new WeakMap<HTMLMediaElement, number>();

/** A scrub committed this time. Later continues use it, not the pre-scrub clock. */
export function noteMediaPlayhead(node: HTMLMediaElement, time: number): void {
  if (mediaElementIsDockHost(node)) return;
  const key = mediaElementKey(node);
  if (!key || !Number.isFinite(time) || time <= HANDOFF_FLOOR_SEC) return;
  progress.set(key, time);
  rewoundTo.set(key, time);
  playheadFix.set(node, time);
  const land = () => {
    if (playheadFix.get(node) !== time) return;
    if (Math.abs(node.currentTime - time) <= 0.5) return;
    try {
      node.currentTime = time;
    } catch {
      /* The element can go away before the seek lands. */
    }
  };
  if (node.seeking) {
    node.addEventListener('seeked', land, { once: true });
    return;
  }
  land();
}

/** Bar and continue use the scrub until the element has actually landed there. */
export function mediaDisplayedPlayhead(node: HTMLMediaElement): number {
  const pending = playheadFix.get(node);
  const live = Number.isFinite(node.currentTime) ? node.currentTime : 0;
  if (pending == null) return live;
  if (Math.abs(live - pending) <= 0.5) {
    playheadFix.delete(node);
    return live;
  }
  return pending;
}

/** The film the viewer is looking at. A face under another face stays quiet. */
export function mediaFaceIsForeground(node: HTMLElement): boolean {
  const face = node.closest('[data-os-slide-over="true"]');
  if (!(face instanceof HTMLElement)) return true;
  if (
    face.classList.contains('is-yielded') ||
    face.classList.contains('is-closing')
  ) {
    return false;
  }
  const faces = face.ownerDocument.querySelectorAll(
    '[data-os-slide-over="true"]:not(.is-closing):not(.is-yielded)'
  );
  let best: HTMLElement = face;
  let bestZ = Number(getComputedStyle(face).zIndex);
  if (!Number.isFinite(bestZ)) bestZ = 0;
  faces.forEach((other) => {
    if (!(other instanceof HTMLElement)) return;
    const z = Number(getComputedStyle(other).zIndex);
    if (!Number.isFinite(z)) return;
    if (z >= bestZ) {
      best = other;
      bestZ = z;
    }
  });
  return best === face;
}

function ownerView(
  node: HTMLMediaElement,
  key: string
): SingleMediaOwnerView | null {
  if (!owner || owner.node === node) {
    return owner
      ? {
          sameElement: true,
          sameKey: owner.key === key,
          active: !owner.node.paused && !mediaElementIsQuiet(owner.node),
          audible:
            !owner.node.paused &&
            !owner.node.muted &&
            owner.node.volume > 0 &&
            !mediaElementIsQuiet(owner.node),
          playing: !owner.node.paused,
          time: owner.node.currentTime,
          stage:
            mediaElementIsStage(owner.node) && !mediaElementIsQuiet(owner.node),
        }
      : null;
  }
  const quiet = mediaElementIsQuiet(owner.node);
  const active = !owner.node.paused && !quiet;
  // The launcher clock is not the album's. A covered post keeps its own.
  const ownerIsDock = mediaElementIsDockHost(owner.node);
  return {
    sameElement: false,
    sameKey: Boolean(key) && owner.key === key && !ownerIsDock,
    active,
    audible: active && !owner.node.muted && owner.node.volume > 0,
    playing: !owner.node.paused && !ownerIsDock,
    time: ownerIsDock
      ? 0
      : Number.isFinite(owner.node.currentTime)
        ? owner.node.currentTime
        : 0,
    stage: mediaElementIsStage(owner.node) && !quiet,
  };
}

function applyDecision(
  node: HTMLMediaElement,
  intent: SingleMediaIntent
): boolean {
  const key = mediaElementKey(node);
  if (!key) return true;
  const decision = resolveSingleMediaPlayback({
    intent,
    selfQuiet: mediaElementIsQuiet(node),
    selfMuted: node.muted || node.volume === 0,
    atStart:
      !Number.isFinite(node.currentTime) ||
      node.currentTime < HANDOFF_FLOOR_SEC,
    savedTime: progress.get(key) ?? 0,
    owner: ownerView(node, key),
  });
  if (!decision.allow) return false;
  if (decision.seekTo != null) {
    try {
      node.currentTime = decision.seekTo;
    } catch {
      /* seek before metadata */
    }
  } else if (intent === 'explicit') {
    const pending = playheadFix.get(node);
    if (
      pending != null &&
      Number.isFinite(node.currentTime) &&
      node.currentTime > pending + 0.5
    ) {
      try {
        node.currentTime = pending;
      } catch {
        /* seek before metadata */
      }
    }
  }
  if (
    shouldPauseForeignOwner({
      pauseOwner: decision.pauseOwner,
      incomingIsDockHost: mediaElementIsDockHost(node),
      ownerIsDockHost: owner ? mediaElementIsDockHost(owner.node) : false,
    }) &&
    owner &&
    owner.node !== node &&
    !owner.node.paused
  ) {
    owner.node.pause();
  }
  owner = { node, key };
  remember(node);
  return true;
}

/**
 * Call immediately before `play`. Returns false when this element must stay
 * quiet (the source is already playing, or this copy is under a drawer).
 */
export function prepareMediaPlayback(
  node: HTMLMediaElement,
  intent: SingleMediaIntent = 'passive'
): boolean {
  const allow = applyDecision(node, intent);
  if (allow && intent !== 'passive') node.dataset.osMediaIntent = intent;
  else delete node.dataset.osMediaIntent;
  return allow;
}

export function startJoinedMedia(
  node: HTMLMediaElement,
  intent: SingleMediaIntent = 'passive'
): Promise<void> {
  const borrow = shouldBorrowSpeakers({
    intent,
    dockHost: mediaElementIsDockHost(node),
    muted: node.muted,
    volume: node.volume,
  });
  if (borrow) node.setAttribute(SPEAKER_CLAIM_ATTR, '');
  if (!prepareMediaPlayback(node, intent)) {
    if (borrow) node.removeAttribute(SPEAKER_CLAIM_ATTR);
    if (!node.paused) node.pause();
    return Promise.resolve();
  }
  if (borrow) {
    // Record the hold before play(), so the song pauses even when the
    // play event arrives late, and it still resumes when this post stops.
    notifyDockBorrow(node, 'start');
    yieldSpeakersTo(node);
  }
  let pending: Promise<void>;
  try {
    pending = node.play();
  } catch (error) {
    if (borrow) {
      node.removeAttribute(SPEAKER_CLAIM_ATTR);
      notifyDockBorrow(node, 'stop');
    }
    return Promise.reject(error);
  }
  return pending.then(
    () => {
      node.removeAttribute(SPEAKER_CLAIM_ATTR);
    },
    (error: unknown) => {
      node.removeAttribute(SPEAKER_CLAIM_ATTR);
      // pause() rejects play() with AbortError. That pause already decided
      // whether the launcher comes back. Releasing here wakes it under a cover.
      if (!playFailureKeepsDockBorrow(error)) notifyDockBorrow(node, 'stop');
      throw error;
    }
  );
}

/** A cover pause aborts play(). The pause handler owns the launcher hold. */
export function playFailureKeepsDockBorrow(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

export function installSingleMediaPlayback(): () => void {
  if (typeof document === 'undefined') return () => {};

  const onPlay = (event: Event) => {
    const node = event.target;
    if (!(node instanceof HTMLMediaElement)) return;
    const intent = readIntent(node);
    if (owner?.node === node && intent === 'passive') return;
    if (!applyDecision(node, intent) && !node.paused) node.pause();
  };

  const onStop = (event: Event) => {
    const node = event.target;
    if (!(node instanceof HTMLMediaElement)) return;
    remember(node);
  };

  document.addEventListener('play', onPlay, true);
  document.addEventListener('pause', onStop, true);
  document.addEventListener('timeupdate', onStop, true);
  return () => {
    document.removeEventListener('play', onPlay, true);
    document.removeEventListener('pause', onStop, true);
    document.removeEventListener('timeupdate', onStop, true);
  };
}
