import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  OsRouteSettle,
  routeSettleCovers,
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
    expect(routeSettleCovers(null, '/discover')).toBe(false);
    expect(routeSettleCovers('/discover', '/discover')).toBe(false);
    expect(
      routeSettleCovers('/@alice.near/posts/1', '/@alice.near/posts/1')
    ).toBe(false);
  });

  it('covers only a client navigation away from the document path', () => {
    expect(routeSettleCovers('/home', '/discover')).toBe(true);
    expect(routeSettleCovers('/home', '/@alice.near/posts/1')).toBe(true);
  });
});

describe('OsRouteSettle server paint', () => {
  it('does not cover server-rendered discover content before hydration', () => {
    const html = settleMarkup(undefined);

    expect(html).toContain('Painted thread');
    expect(html).not.toContain('os-route-skeleton');
    expect(html).not.toContain('cover-probe');
  });

  it('does not cover a server-rendered post when reduced motion would show the thread', () => {
    const html = settleMarkup(false);

    expect(html).toContain('Painted thread');
    expect(html).toContain('os-page-body-appear');
    expect(html).not.toContain('is-ready');
    expect(html).not.toContain('os-route-skeleton');
    expect(html).not.toContain('cover-probe');
  });
});
