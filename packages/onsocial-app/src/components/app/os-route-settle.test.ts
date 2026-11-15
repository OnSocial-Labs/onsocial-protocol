import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OsRouteSettle } from '@/components/app/os-route-settle';

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
