import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  HOME_FEED_PULL_IDLE,
  HOME_FEED_PULL_MAX_PX,
  HOME_FEED_PULL_TRIGGER_PX,
  canStartHomeFeedPull,
  homeFeedPullLabel,
  homeFeedPullOnRefreshingFlag,
  homeFeedPullScrollTop,
  homeFeedPullTravel,
  stepHomeFeedPull,
  type HomeFeedPullInput,
  type HomeFeedPullState,
} from './home-feed-pull-refresh';

const here = dirname(fileURLToPath(import.meta.url));

const atTop: HomeFeedPullInput = {
  scrollTop: 0,
  refreshing: false,
  loading: false,
  loadingMore: false,
  hasRows: true,
};

function drag(fingerY: number, scrollTop = 0) {
  const down = stepHomeFeedPull(HOME_FEED_PULL_IDLE, {
    type: 'down',
    y: 0,
    input: { ...atTop, scrollTop },
  });
  return stepHomeFeedPull(down.state, {
    type: 'move',
    y: fingerY,
    scrollTop,
  });
}

describe('canStartHomeFeedPull', () => {
  it('arms only at the top of an idle list that already has rows', () => {
    expect(canStartHomeFeedPull(atTop)).toBe(true);
    expect(canStartHomeFeedPull({ ...atTop, scrollTop: 8 })).toBe(true);
    expect(canStartHomeFeedPull({ ...atTop, scrollTop: 9 })).toBe(false);
    expect(canStartHomeFeedPull({ ...atTop, refreshing: true })).toBe(false);
    expect(canStartHomeFeedPull({ ...atTop, loading: true })).toBe(false);
    expect(canStartHomeFeedPull({ ...atTop, loadingMore: true })).toBe(false);
    expect(canStartHomeFeedPull({ ...atTop, hasRows: false })).toBe(false);
  });

  it('treats a Lenis offset as scrolled when the element offset is still zero', () => {
    expect(homeFeedPullScrollTop(0, 24)).toBe(24);
    expect(
      canStartHomeFeedPull({ ...atTop, scrollTop: homeFeedPullScrollTop(0, 24) })
    ).toBe(false);
  });
});

describe('stepHomeFeedPull', () => {
  it('ignores a drag that starts further down the list', () => {
    const down = stepHomeFeedPull(HOME_FEED_PULL_IDLE, {
      type: 'down',
      y: 0,
      input: { ...atTop, scrollTop: 240 },
    });
    expect(down.state.phase).toBe('idle');
    expect(down.refresh).toBe(false);
    const moved = stepHomeFeedPull(down.state, {
      type: 'move',
      y: 180,
      scrollTop: 240,
    });
    expect(moved.claim).toBe(false);
    expect(moved.refresh).toBe(false);
  });

  it('drops the gesture when the list leaves the top before it is claimed', () => {
    const down = stepHomeFeedPull(HOME_FEED_PULL_IDLE, {
      type: 'down',
      y: 0,
      input: atTop,
    });
    const moved = stepHomeFeedPull(down.state, {
      type: 'move',
      y: 40,
      scrollTop: 40,
    });
    expect(moved.state).toBe(HOME_FEED_PULL_IDLE);
    expect(moved.refresh).toBe(false);
    expect(moved.claim).toBe(false);
  });

  it('does not claim a short or upward drag', () => {
    const short = drag(20);
    expect(short.state.phase).toBe('pending');
    expect(short.claim).toBe(false);
    expect(short.refresh).toBe(false);
    const up = stepHomeFeedPull(short.state, {
      type: 'move',
      y: -12,
      scrollTop: 0,
    });
    expect(up.state.phase).toBe('idle');
    expect(up.refresh).toBe(false);
  });

  it('shows the indicator while pulling and reloads only past the trigger', () => {
    const pulling = drag(100);
    expect(pulling.state.phase).toBe('pulling');
    expect(pulling.claim).toBe(true);
    expect(pulling.refresh).toBe(false);
    expect(pulling.state.distance).toBe(50);
    expect(homeFeedPullLabel(pulling.state.phase, pulling.state.distance)).toBe(
      'Pull to check'
    );
    const early = stepHomeFeedPull(pulling.state, { type: 'up', input: atTop });
    expect(early.refresh).toBe(false);
    expect(early.state.phase).toBe('idle');

    const armed = drag(140);
    expect(armed.state.distance).toBe(70);
    expect(homeFeedPullLabel(armed.state.phase, armed.state.distance)).toBe(
      'Release to check'
    );
    const released = stepHomeFeedPull(armed.state, {
      type: 'up',
      input: atTop,
    });
    expect(released.refresh).toBe(true);
    expect(released.state.phase).toBe('refreshing');
    expect(released.state.distance).toBe(HOME_FEED_PULL_TRIGGER_PX);
    expect(homeFeedPullLabel('refreshing', released.state.distance)).toBe(
      'Checking…'
    );
    const again = stepHomeFeedPull(released.state, {
      type: 'up',
      input: atTop,
    });
    expect(again.refresh).toBe(false);
    expect(again.state.phase).toBe('refreshing');
  });

  it('does not reload if the finger lifts after the list has moved', () => {
    const armed = drag(140);
    const released = stepHomeFeedPull(armed.state, {
      type: 'up',
      input: { ...atTop, scrollTop: 80 },
    });
    expect(released.refresh).toBe(false);
    expect(released.state.phase).toBe('idle');
  });

  it('does not reload over a load already in flight', () => {
    const armed = drag(140);
    for (const busy of [
      { refreshing: true },
      { loading: true },
      { loadingMore: true },
      { hasRows: false },
    ] as const) {
      const released = stepHomeFeedPull(armed.state, {
        type: 'up',
        input: { ...atTop, ...busy },
      });
      expect(released.refresh).toBe(false);
      expect(released.state.phase).toBe('idle');
    }
  });

  it('caps the indicator and lets a pull shrink back without reloading', () => {
    expect(homeFeedPullTravel(400)).toBe(HOME_FEED_PULL_MAX_PX);
    expect(homeFeedPullTravel(-20)).toBe(0);
    const capped = drag(400);
    expect(capped.state.distance).toBe(HOME_FEED_PULL_MAX_PX);
    const back = stepHomeFeedPull(capped.state, {
      type: 'move',
      y: 10,
      scrollTop: 0,
    });
    expect(back.state.phase).toBe('pending');
    expect(back.claim).toBe(false);
    const released = stepHomeFeedPull(back.state, { type: 'up', input: atTop });
    expect(released.refresh).toBe(false);
  });

  it('ignores a new drag until the refresh settles', () => {
    const refreshing: HomeFeedPullState = {
      phase: 'refreshing',
      distance: HOME_FEED_PULL_TRIGGER_PX,
      startY: 0,
    };
    const down = stepHomeFeedPull(refreshing, {
      type: 'down',
      y: 0,
      input: atTop,
    });
    expect(down.state).toBe(refreshing);
    expect(down.refresh).toBe(false);
    const cancelled = stepHomeFeedPull(refreshing, { type: 'cancel' });
    expect(cancelled.state.phase).toBe('refreshing');
    expect(stepHomeFeedPull(refreshing, { type: 'settled' }).state).toBe(
      HOME_FEED_PULL_IDLE
    );
  });

  it('waits for the soft refresh flag, then clears', () => {
    const refreshing: HomeFeedPullState = {
      phase: 'refreshing',
      distance: HOME_FEED_PULL_TRIGGER_PX,
      startY: 0,
    };
    const waiting = homeFeedPullOnRefreshingFlag(refreshing, false, false);
    expect(waiting.armWait).toBe(true);
    expect(waiting.state.phase).toBe('refreshing');
    const seen = homeFeedPullOnRefreshingFlag(refreshing, true, false);
    expect(seen.sawRefresh).toBe(true);
    expect(seen.armWait).toBe(false);
    const done = homeFeedPullOnRefreshingFlag(refreshing, false, true);
    expect(done.state).toBe(HOME_FEED_PULL_IDLE);
    expect(homeFeedPullOnRefreshingFlag(HOME_FEED_PULL_IDLE, false, true)).toEqual(
      { state: HOME_FEED_PULL_IDLE, sawRefresh: false, armWait: false }
    );
  });
});

describe('home feed pull wiring', () => {
  it('reuses the soft head reload and does not move the scroller', () => {
    const feed = readFileSync(join(here, 'home-feed.tsx'), 'utf8');
    const hook = readFileSync(join(here, 'use-home-feed-pull-refresh.ts'), 'utf8');
    const css = readFileSync(
      join(here, '../../app/globals.css'),
      'utf8'
    );
    expect(feed).toContain('useHomeFeedPullRefresh');
    expect(feed).toContain('onRefresh: retryLoad');
    expect(hook).toContain("pointerType === 'mouse'");
    expect(hook).toContain('passive: false');
    expect(hook).toContain('[data-feed-session="covered"]');
    expect(hook).not.toContain('scrollFeedToNewest');
    expect(hook).not.toContain('.scrollTo(');
    const anchorStart = css.indexOf('  .home-feed-pull {');
    const anchorEnd = css.indexOf('  .home-feed-pull-pill {');
    const anchor = css.slice(anchorStart, anchorEnd);
    expect(anchor).toContain('translateY(var(--home-feed-pull, 0px))');
    expect(anchor).toContain('pointer-events: none');
    expect(anchor).not.toContain('padding');
    expect(css).toContain('Do not pad `.os-app-screen-body`');
  });
});
