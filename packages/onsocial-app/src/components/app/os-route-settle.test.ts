import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  OsRouteSettle,
  routeSettleCovers,
  routeSettleHoldsCover,
} from '@/components/app/os-route-settle';

vi.mock('next/navigation', () => ({
  usePathname: () => '/discover',
}));

function settleMarkup(ready?: boolean) {
  const painted = createElement('p', null, 'Painted thread');
  const skeleton = createElement('div', { className: 'cover-probe' }, 'cover');
  const Settle = OsRouteSettle as (props: {
    ready?: boolean;
    skeleton: ReactNode;
  }) => ReactNode;
  return renderToStaticMarkup(
    createElement(Settle, { ready, skeleton }, painted)
  );
}

describe('routeSettleCovers', () => {
  it('stays off for a hard load of the document path, including the loading-shell swap', () => {
    expect(routeSettleCovers(null, '/discover', false)).toBe(false);
    expect(routeSettleCovers('/discover', '/discover', false)).toBe(false);
    expect(
      routeSettleCovers('/@alice.near/posts/1', '/@alice.near/posts/1', false)
    ).toBe(false);
  });

  it('covers a client navigation, including a return to the document path', () => {
    expect(routeSettleCovers('/home', '/discover', false)).toBe(true);
    expect(routeSettleCovers('/home', '/@alice.near/posts/1', false)).toBe(
      true
    );
    expect(routeSettleCovers('/discover', '/discover', true)).toBe(true);
  });
});

describe('routeSettleHoldsCover', () => {
  it('holds for a managed gate that is still closed, including hard loads', () => {
    expect(routeSettleHoldsCover(true, false)).toBe(true);
  });

  it('releases when ready, settle is off, or the gate is unmanaged', () => {
    expect(routeSettleHoldsCover(true, true)).toBe(false);
    expect(routeSettleHoldsCover(false, false)).toBe(false);
    expect(routeSettleHoldsCover(true, undefined)).toBe(false);
  });
});

describe('OsRouteSettle server paint', () => {
  it('does not cover server-rendered discover content before hydration', () => {
    const html = settleMarkup(undefined);

    expect(html).toContain('Painted thread');
    expect(html).not.toContain('os-route-skeleton');
    expect(html).not.toContain('cover-probe');
  });

  it('covers a managed post body until permalinkReady so hard loads are not blank', () => {
    const html = settleMarkup(false);

    expect(html).toContain('Painted thread');
    expect(html).toContain('os-page-body-appear');
    expect(html).not.toContain('is-ready');
    expect(html).toContain('os-route-skeleton');
    expect(html).toContain('cover-probe');
    expect(html).toContain('aria-busy="true"');
  });

  it('does not cover a managed post that is already ready', () => {
    const html = settleMarkup(true);

    expect(html).toContain('Painted thread');
    expect(html).toContain('is-ready');
    expect(html).toContain('is-present');
    expect(html).not.toContain('os-route-skeleton');
    expect(html).not.toContain('cover-probe');
  });
});
