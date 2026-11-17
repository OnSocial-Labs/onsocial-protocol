// @ts-nocheck — renderer tests follow the existing panel harness, which has no renderer types.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { act, create } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';
import { OsPageBodyAppear } from '@/components/app/os-page-body-appear';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function className(markup: string): string {
  return markup.match(/class="([^"]*)"/)?.[1] ?? '';
}

describe('OsPageBodyAppear first paint', () => {
  it('mounts a not-ready body without the ready or present classes', () => {
    const html = renderToStaticMarkup(
      createElement(OsPageBodyAppear, { ready: false }, 'Waiting')
    );

    expect(html).toContain('Waiting');
    expect(className(html)).toBe('os-page-body-appear');
  });

  it('keeps the fade when a body mounts ready without present', () => {
    const html = renderToStaticMarkup(
      createElement(OsPageBodyAppear, { ready: true }, 'Painted')
    );

    expect(className(html)).toContain('is-ready');
    expect(className(html)).not.toContain('is-present');
  });

  it('mounts an already-ready body present, so it does not fade from empty', () => {
    const html = renderToStaticMarkup(
      createElement(OsPageBodyAppear, { ready: true, present: true }, 'Painted')
    );

    expect(className(html)).toContain('is-ready');
    expect(className(html)).toContain('is-present');
  });

  it('fades an unmanaged body after layout, without skipping the keyframe', () => {
    const html = renderToStaticMarkup(
      createElement(OsPageBodyAppear, null, 'Later')
    );
    expect(className(html)).toBe('os-page-body-appear');

    let renderer: ReturnType<typeof create> | undefined;
    act(() => {
      renderer = create(createElement(OsPageBodyAppear, null, 'Later'));
    });
    expect(renderer?.toJSON()).toMatchObject({
      props: { className: 'os-page-body-appear is-ready' },
    });
  });

  it('fades a body that mounts not-ready and becomes ready later', () => {
    let renderer: ReturnType<typeof create> | undefined;
    act(() => {
      renderer = create(
        createElement(OsPageBodyAppear, { ready: false }, 'Later')
      );
    });
    expect(renderer?.toJSON()).toMatchObject({
      props: { className: 'os-page-body-appear' },
    });

    act(() => {
      renderer?.update(
        createElement(OsPageBodyAppear, { ready: true }, 'Later')
      );
    });
    expect(renderer?.toJSON()).toMatchObject({
      props: { className: 'os-page-body-appear is-ready' },
    });
  });
});
