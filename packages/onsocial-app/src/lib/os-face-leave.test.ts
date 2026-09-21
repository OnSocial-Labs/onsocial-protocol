import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { APP_HOME_PATH } from '@/lib/app-routes';
import {
  EMPTY_OS_FACE_LEAVE_STATE,
  normalizeOsLeaveHref,
  peekOsFaceLeaveHref,
  portfolioAccountFromHref,
  reduceOsFaceLeaveConsume,
  reduceOsFaceLeaveHop,
  type OsFaceLeaveState,
} from './os-face-leave';
import {
  applyOsFaceLeaveHop,
  clearOsFaceLeaveForTests,
  consumeOsFaceLeaveHref,
  readOsFaceLeaveHref,
} from './os-face-leave-store';

afterEach(() => {
  clearOsFaceLeaveForTests();
});

function hop(
  href: string,
  state: OsFaceLeaveState = EMPTY_OS_FACE_LEAVE_STATE
): OsFaceLeaveState {
  return reduceOsFaceLeaveHop(state, href);
}

describe('normalizeOsLeaveHref', () => {
  it('keeps app paths and query, drops the gate', () => {
    expect(normalizeOsLeaveHref('/discover?tab=profiles')).toBe(
      '/discover?tab=profiles'
    );
    expect(normalizeOsLeaveHref('/home#x')).toBe('/home');
    expect(normalizeOsLeaveHref('/')).toBeNull();
    expect(normalizeOsLeaveHref('https://onsocial.id/home')).toBeNull();
    expect(normalizeOsLeaveHref('/api/graph')).toBeNull();
  });
});

describe('portfolioAccountFromHref', () => {
  it('reads the face account including overlays', () => {
    expect(portfolioAccountFromHref('/@alice.near')).toBe('alice.near');
    expect(portfolioAccountFromHref('/@alice.near/standing/incoming')).toBe(
      'alice.near'
    );
    expect(portfolioAccountFromHref('/discover')).toBeNull();
  });
});

describe('os face leave hop', () => {
  it('deep-links a face with an empty stack (leave Home)', () => {
    const next = hop('/@alice.near');
    expect(next.stack).toEqual([]);
    expect(peekOsFaceLeaveHref(next)).toBe(APP_HOME_PATH);
  });

  it('returns Discover with query after opening a face from there', () => {
    const next = hop('/@alice.near', hop('/discover?tab=profiles&q=os'));
    expect(peekOsFaceLeaveHref(next)).toBe('/discover?tab=profiles&q=os');
  });

  it('does not push overlay hops on the same face', () => {
    const next = hop(
      '/@alice.near/about',
      hop('/@alice.near', hop('/discover'))
    );
    expect(next.stack).toEqual(['/discover']);
  });

  it('stacks a second face so dock leave is the previous profile', () => {
    const next = hop('/@bob.near', hop('/@alice.near', hop('/discover')));
    expect(next.stack).toEqual(['/discover', '/@alice.near']);
    expect(peekOsFaceLeaveHref(next)).toBe('/@alice.near');
  });

  it('does not re-push when dock-leaving back to the origin face', () => {
    const onBob = hop('/@bob.near', hop('/@alice.near', hop('/discover')));
    const consumed = reduceOsFaceLeaveConsume(onBob);
    expect(consumed.href).toBe('/@alice.near');
    const backOnAlice = reduceOsFaceLeaveHop(consumed.state, '/@alice.near');
    expect(backOnAlice.stack).toEqual(['/discover']);
    expect(backOnAlice.popping).toBe(false);
  });

  it('clears the stack on an index so launcher hops cannot loop', () => {
    const onAlice = hop('/@alice.near', hop('/discover'));
    const onMarket = hop('/market', onAlice);
    expect(onMarket.stack).toEqual([]);
    expect(peekOsFaceLeaveHref(onMarket)).toBe(APP_HOME_PATH);
  });

  it('opens Home from a face opened from Home', () => {
    const next = hop('/@alice.near', hop('/home'));
    expect(peekOsFaceLeaveHref(next)).toBe('/home');
  });
});

describe('os face leave store', () => {
  it('round-trips Discover → face → consume', () => {
    applyOsFaceLeaveHop('/discover');
    applyOsFaceLeaveHop('/@alice.near');
    expect(readOsFaceLeaveHref()).toBe('/discover');
    expect(consumeOsFaceLeaveHref()).toBe('/discover');
    applyOsFaceLeaveHop('/discover');
    expect(readOsFaceLeaveHref()).toBe(APP_HOME_PATH);
  });
});

describe('os face leave wiring', () => {
  it('tracks hops in providers and consumes on the face dock', () => {
    const libDir = dirname(fileURLToPath(import.meta.url));
    const dock = readFileSync(
      join(libDir, '../components/portfolio/portfolio-summon-dock.tsx'),
      'utf8'
    );
    const providers = readFileSync(
      join(libDir, '../components/providers/app-providers.tsx'),
      'utf8'
    );
    expect(dock).toContain('consumeOsFaceLeaveHref');
    expect(dock).toContain('readOsFaceLeaveHref');
    expect(providers).toContain('OsFaceLeaveTracker');
  });
});
