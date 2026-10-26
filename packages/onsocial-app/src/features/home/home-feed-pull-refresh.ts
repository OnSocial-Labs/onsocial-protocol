/**
 * Pull-to-check on Home. The gesture only arms while the scroller is at
 * the top. Releasing past the trigger reloads the head; the list itself
 * does not move (no padding animation on the scroller).
 */

/** A resting wheel offset can sit a few pixels under zero. Still the top. */
export const HOME_FEED_PULL_TOP_SLOP_PX = 8;

/** Visual travel before the drag is claimed and the indicator appears. */
export const HOME_FEED_PULL_ARM_PX = 16;

/** Visual travel that reloads the head on release. */
export const HOME_FEED_PULL_TRIGGER_PX = 64;

/** Cap so the indicator cannot travel the column. */
export const HOME_FEED_PULL_MAX_PX = 96;

/** Finger travel is eased so the indicator stays behind the finger. */
const HOME_FEED_PULL_RESISTANCE = 0.5;

/**
 * If the soft refresh never flags, drop the indicator. The list dim is
 * the real "in progress" signal once the reload starts.
 */
export const HOME_FEED_PULL_REFRESH_WAIT_MS = 700;

export type HomeFeedPullPhase = 'idle' | 'pending' | 'pulling' | 'refreshing';

export type HomeFeedPullState = {
  phase: HomeFeedPullPhase;
  /** Visual travel in px, already resisted and capped. */
  distance: number;
  startY: number;
};

export const HOME_FEED_PULL_IDLE: HomeFeedPullState = {
  phase: 'idle',
  distance: 0,
  startY: 0,
};

export type HomeFeedPullInput = {
  scrollTop: number;
  refreshing: boolean;
  loading: boolean;
  loadingMore: boolean;
  hasRows: boolean;
};

export type HomeFeedPullEvent =
  | { type: 'down'; y: number; input: HomeFeedPullInput }
  | { type: 'move'; y: number; scrollTop: number }
  | { type: 'up'; input: HomeFeedPullInput }
  | { type: 'cancel' }
  | { type: 'settled' };

export type HomeFeedPullStep = {
  state: HomeFeedPullState;
  /** True once, on the release that should reload the head. */
  refresh: boolean;
  /** Caller should preventDefault so the scroller does not eat the drag. */
  claim: boolean;
};

export function homeFeedPullScrollTop(
  scrollTop: number,
  lenisScroll: number
): number {
  return Math.max(scrollTop, lenisScroll);
}

/** A pull can start only while the list is sitting at the top and idle. */
export function canStartHomeFeedPull(input: HomeFeedPullInput): boolean {
  if (input.refreshing || input.loading || input.loadingMore) return false;
  if (!input.hasRows) return false;
  return input.scrollTop <= HOME_FEED_PULL_TOP_SLOP_PX;
}

/** Downward finger travel, resisted and capped. Upward movement is 0. */
export function homeFeedPullTravel(deltaY: number): number {
  if (!(deltaY > 0)) return 0;
  return Math.min(
    HOME_FEED_PULL_MAX_PX,
    deltaY * HOME_FEED_PULL_RESISTANCE
  );
}

export function homeFeedPullArmed(distance: number): boolean {
  return distance >= HOME_FEED_PULL_TRIGGER_PX;
}

export function homeFeedPullLabel(
  phase: HomeFeedPullPhase,
  distance: number
): string | null {
  if (phase === 'refreshing') return 'Checking…';
  if (phase !== 'pulling') return null;
  return homeFeedPullArmed(distance) ? 'Release to check' : 'Pull to check';
}

function idleStep(): HomeFeedPullStep {
  return { state: HOME_FEED_PULL_IDLE, refresh: false, claim: false };
}

function keep(state: HomeFeedPullState, claim = false): HomeFeedPullStep {
  return { state, refresh: false, claim };
}

export function stepHomeFeedPull(
  state: HomeFeedPullState,
  event: HomeFeedPullEvent
): HomeFeedPullStep {
  if (event.type === 'settled') {
    if (state.phase !== 'refreshing') return keep(state);
    return idleStep();
  }

  if (event.type === 'cancel') {
    if (state.phase === 'refreshing') return keep(state);
    return idleStep();
  }

  if (event.type === 'down') {
    if (state.phase === 'refreshing' || state.phase === 'pulling') {
      return keep(state);
    }
    if (!canStartHomeFeedPull(event.input)) return idleStep();
    return keep({ phase: 'pending', distance: 0, startY: event.y });
  }

  if (event.type === 'move') {
    if (state.phase === 'idle' || state.phase === 'refreshing') {
      return keep(state);
    }
    if (
      state.phase === 'pending' &&
      event.scrollTop > HOME_FEED_PULL_TOP_SLOP_PX
    ) {
      return idleStep();
    }
    const delta = event.y - state.startY;
    if (delta < -HOME_FEED_PULL_TOP_SLOP_PX) return idleStep();
    const distance = homeFeedPullTravel(delta);
    if (distance < HOME_FEED_PULL_ARM_PX) {
      if (state.phase === 'pending' && state.distance === 0) return keep(state);
      return keep({ phase: 'pending', distance: 0, startY: state.startY });
    }
    return {
      state: { phase: 'pulling', distance, startY: state.startY },
      refresh: false,
      claim: true,
    };
  }

  if (state.phase !== 'pulling') {
    if (state.phase === 'refreshing') return keep(state);
    return idleStep();
  }
  if (!canStartHomeFeedPull(event.input)) return idleStep();
  if (!homeFeedPullArmed(state.distance)) return idleStep();
  return {
    state: {
      phase: 'refreshing',
      distance: HOME_FEED_PULL_TRIGGER_PX,
      startY: 0,
    },
    refresh: true,
    claim: false,
  };
}

/**
 * Drop the indicator once the soft refresh finishes. `armWait` is true
 * until that flag is seen, so a reload that never starts can time out.
 */
export function homeFeedPullOnRefreshingFlag(
  state: HomeFeedPullState,
  refreshing: boolean,
  sawRefresh: boolean
): { state: HomeFeedPullState; sawRefresh: boolean; armWait: boolean } {
  if (state.phase !== 'refreshing') {
    return { state, sawRefresh: false, armWait: false };
  }
  if (refreshing) {
    return { state, sawRefresh: true, armWait: false };
  }
  if (sawRefresh) {
    return { state: HOME_FEED_PULL_IDLE, sawRefresh: false, armWait: false };
  }
  return { state, sawRefresh: false, armWait: true };
}
