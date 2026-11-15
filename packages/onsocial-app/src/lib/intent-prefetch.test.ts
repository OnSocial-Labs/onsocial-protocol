import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { createIntentPrefetchSession } from '@/lib/intent-prefetch';

const appSrc = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://onsocial.test/home';

function session() {
  const prefetch = vi.fn();
  return { prefetch, intent: createIntentPrefetchSession(prefetch) };
}

describe('intent prefetch', () => {
  it('prefetches once per href on pointer enter and keyboard focus', () => {
    const { prefetch, intent } = session();
    const post = '/@alice.near/posts/1';

    expect(
      intent.request({
        href: post,
        base: BASE,
        kind: 'pointerenter',
        now: 1_000,
        keyboard: false,
      })
    ).toBe(true);
    expect(
      intent.request({
        href: post,
        base: BASE,
        kind: 'pointerenter',
        now: 1_100,
        keyboard: false,
      })
    ).toBe(false);
    expect(
      intent.request({
        href: `${post}#reply`,
        base: BASE,
        kind: 'focus',
        now: 1_200,
        keyboard: true,
      })
    ).toBe(false);
    expect(
      intent.request({
        href: '/discover',
        base: BASE,
        kind: 'focus',
        now: 1_300,
        keyboard: true,
      })
    ).toBe(true);
    expect(
      intent.request({
        href: '/discover',
        base: BASE,
        kind: 'touchstart',
        now: 1_400,
        keyboard: false,
      })
    ).toBe(false);

    expect(prefetch).toHaveBeenCalledTimes(2);
    expect(prefetch).toHaveBeenNthCalledWith(1, post);
    expect(prefetch).toHaveBeenNthCalledWith(2, '/discover');
  });

  it('ignores pointer focus, scroll-driven enters, and other origins', () => {
    const { prefetch, intent } = session();

    expect(
      intent.request({
        href: '/discover',
        base: BASE,
        kind: 'focus',
        now: 500,
        keyboard: false,
      })
    ).toBe(false);

    intent.noteScroll(1_000);
    expect(
      intent.request({
        href: '/discover',
        base: BASE,
        kind: 'pointerenter',
        now: 1_050,
        keyboard: false,
      })
    ).toBe(false);
    expect(
      intent.request({
        href: '/discover',
        base: BASE,
        kind: 'pointerenter',
        now: 1_200,
        keyboard: false,
      })
    ).toBe(true);

    expect(
      intent.request({
        href: 'https://example.com/discover',
        base: BASE,
        kind: 'pointerenter',
        now: 1_300,
        keyboard: false,
      })
    ).toBe(false);

    expect(prefetch).toHaveBeenCalledTimes(1);
    expect(prefetch).toHaveBeenCalledWith('/discover');
  });

  it('wires pointer enter, touch start, and keyboard focus through one host', () => {
    const host = readFileSync(
      join(appSrc, 'components/providers/intent-prefetch-host.tsx'),
      'utf8'
    );
    const providers = readFileSync(
      join(appSrc, 'components/providers/app-providers.tsx'),
      'utf8'
    );

    expect(host).toContain('createIntentPrefetchSession');
    expect(host).toContain("'pointerenter'");
    expect(host).toContain("'touchstart'");
    expect(host).toContain("'focus'");
    expect(host).toContain('noteScroll');
    expect(host).not.toContain('requestIdleCallback');
    expect(providers).toContain('<IntentPrefetchHost />');
  });
});

describe('cold route skeletons', () => {
  it('renders the post thread skeleton on the post routes', () => {
    const personal = readFileSync(
      join(appSrc, 'app/[accountId]/posts/[postId]/loading.tsx'),
      'utf8'
    );
    const guild = readFileSync(
      join(
        appSrc,
        'app/(app)/groups/[groupId]/posts/[author]/[postId]/loading.tsx'
      ),
      'utf8'
    );
    const screen = readFileSync(
      join(appSrc, 'features/home/post-thread-route-loading.tsx'),
      'utf8'
    );

    expect(personal).toContain('PostThreadRouteLoading');
    expect(guild).toContain('PostThreadRouteLoading');
    expect(screen).toContain('PostThreadPageSkeleton');
    expect(screen).toContain('aria-busy="true"');
  });

  it('renders Discover through the same panel, then fades that skeleton out', () => {
    const loading = readFileSync(
      join(appSrc, 'app/(app)/discover/loading.tsx'),
      'utf8'
    );
    const panel = readFileSync(
      join(appSrc, 'features/discover/discover-page-panel.tsx'),
      'utf8'
    );
    const css = readFileSync(join(appSrc, 'app/globals.css'), 'utf8');

    expect(loading).toContain('DiscoverPagePanel');
    expect(panel).toContain('OsRouteSettle');
    expect(panel).toContain('DiscoverMovingLandingSkeleton');
    expect(css).toContain('.os-route-skeleton.is-done');
    expect(css).toContain('glass-sheet-appear');
    expect(css).toContain('prefers-reduced-motion: reduce');
  });

  it('keeps the reply fade and does not skeleton the open sheet', () => {
    const personal = readFileSync(
      join(appSrc, 'features/home/live-personal-post-panel.tsx'),
      'utf8'
    );
    const sheet = readFileSync(
      join(appSrc, 'features/home/post-thread-layer.tsx'),
      'utf8'
    );
    const embeddedAt = personal.indexOf('if (embedded)');
    const settleAt = personal.indexOf('<OsRouteSettle');

    expect(embeddedAt).toBeGreaterThan(-1);
    expect(settleAt).toBeGreaterThan(embeddedAt);
    expect(personal).toContain('ready={permalinkReady}');
    expect(personal).toContain('PostThreadPageSkeleton');
    expect(sheet).not.toContain('PostThreadPageSkeleton');
    expect(sheet).toContain('OsPageBodyAppear ready={threadPainted}');
  });
});
