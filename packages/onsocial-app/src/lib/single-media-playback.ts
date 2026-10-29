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

export function resetSingleMediaPlaybackForTests(): void {
  owner = null;
  progress.clear();
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
  const key = mediaElementKey(node);
  if (!key || !Number.isFinite(node.currentTime)) return;
  const prev = progress.get(key) ?? 0;
  if (node.currentTime < HANDOFF_FLOOR_SEC && prev > HANDOFF_FLOOR_SEC) return;
  progress.set(key, node.currentTime);
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
  return {
    sameElement: false,
    sameKey: Boolean(key) && owner.key === key,
    active,
    audible: active && !owner.node.muted && owner.node.volume > 0,
    playing: !owner.node.paused,
    time: Number.isFinite(owner.node.currentTime) ? owner.node.currentTime : 0,
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
  }
  if (
    decision.pauseOwner &&
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
  if (!prepareMediaPlayback(node, intent)) {
    if (!node.paused) node.pause();
    return Promise.resolve();
  }
  return node.play();
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
