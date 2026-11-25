import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  CollectionDropEnter,
  CollectionSeatSettle,
  DROP_ENTER_BLOCK_COUNT,
  DROP_ENTER_DELAY_STEP_MS,
  dropEnterDelayMs,
  dropEnterMode,
  dropEnterPlayback,
  dropEnterShouldPlay,
  nextSeatPhase,
  readMotionAppearMs,
} from '@/features/scarces/collection-page-enter';

describe('drop enter playback', () => {
  it('staggers a cold ready paint and keeps that answer across refresh and wallet ticks', () => {
    const cold = {
      seededHotOpen: false,
      reducedMotion: false,
      ready: true,
    };
    expect(dropEnterPlayback(cold)).toBe('stagger');
    expect(dropEnterPlayback({ ...cold, ready: true })).toBe('stagger');
    expect(
      dropEnterShouldPlay({
        mode: dropEnterMode(cold),
        played: false,
        ready: true,
      })
    ).toBe(true);
  });

  it('does not play before the drop is ready', () => {
    expect(
      dropEnterPlayback({
        seededHotOpen: false,
        reducedMotion: false,
        ready: false,
      })
    ).toBe('instant');
  });

  it('paints a seeded or hot open instantly, including a second call', () => {
    const seeded = {
      seededHotOpen: true,
      reducedMotion: false,
      ready: true,
    };
    expect(dropEnterMode(seeded)).toBe('instant');
    expect(dropEnterPlayback(seeded)).toBe('instant');
    expect(
      dropEnterShouldPlay({
        mode: 'stagger',
        played: true,
        ready: true,
      })
    ).toBe(false);
  });

  it('shows reduced motion instantly with no stagger', () => {
    expect(dropEnterMode({ seededHotOpen: false, reducedMotion: true })).toBe(
      'instant'
    );
    expect(
      dropEnterPlayback({
        seededHotOpen: false,
        reducedMotion: true,
        ready: true,
      })
    ).toBe('instant');
    expect(
      dropEnterShouldPlay({
        mode: 'instant',
        played: false,
        ready: true,
      })
    ).toBe(false);
  });

  it('spaces the four blocks 60ms apart', () => {
    expect(DROP_ENTER_BLOCK_COUNT).toBe(4);
    expect(DROP_ENTER_DELAY_STEP_MS).toBe(60);
    expect(
      Array.from({ length: DROP_ENTER_BLOCK_COUNT }, (_, index) =>
        dropEnterDelayMs(index)
      )
    ).toEqual([0, 60, 120, 180]);
  });

  it('marks stagger blocks with the shared class and delay variable', () => {
    const html = renderToStaticMarkup(
      createElement(CollectionDropEnter, { play: true, index: 2 }, 'Mint')
    );
    expect(html).toContain('collection-drop-enter');
    expect(html).toContain('is-play');
    expect(html).toContain('data-drop-enter="stagger"');
    expect(html).toContain('--drop-enter-delay:120ms');
  });

  it('omits the play class when the entrance is instant', () => {
    const html = renderToStaticMarkup(
      createElement(CollectionDropEnter, { play: false, index: 0 }, 'Cover')
    );
    expect(html).toContain('data-drop-enter="instant"');
    expect(html).not.toContain('is-play');
    expect(html).not.toContain('--drop-enter-delay');
  });
});

describe('seat crossfade', () => {
  it('holds, leaves once, and does not replay when pending returns', () => {
    expect(
      nextSeatPhase({
        phase: 'hold',
        pending: true,
        reducedMotion: false,
        startedPending: true,
      })
    ).toBe('hold');
    expect(
      nextSeatPhase({
        phase: 'hold',
        pending: false,
        reducedMotion: false,
        startedPending: true,
      })
    ).toBe('leave');
    expect(
      nextSeatPhase({
        phase: 'leave',
        pending: false,
        reducedMotion: false,
        startedPending: true,
      })
    ).toBe('leave');
    expect(
      nextSeatPhase({
        phase: 'off',
        pending: true,
        reducedMotion: false,
        startedPending: true,
      })
    ).toBe('off');
  });

  it('drops the cover immediately when reduced motion is on', () => {
    expect(
      nextSeatPhase({
        phase: 'hold',
        pending: false,
        reducedMotion: true,
        startedPending: true,
      })
    ).toBe('off');
  });

  it('skips the cover when the seat mounted with content', () => {
    expect(
      nextSeatPhase({
        phase: 'off',
        pending: false,
        reducedMotion: false,
        startedPending: false,
      })
    ).toBe('off');
    const html = renderToStaticMarkup(
      createElement(
        CollectionSeatSettle,
        {
          pending: false,
          skeleton: createElement('div', { className: 'sk' }, 'skeleton'),
        },
        'Tracks'
      )
    );
    expect(html).toContain('Tracks');
    expect(html).not.toContain('os-route-skeleton');
    expect(html).not.toContain('sk');
  });

  it('paints the skeleton while the seat is still pending', () => {
    const html = renderToStaticMarkup(
      createElement(
        CollectionSeatSettle,
        {
          pending: true,
          skeleton: createElement('div', { className: 'sk' }, 'skeleton'),
        },
        'Tracks'
      )
    );
    expect(html).toContain('skeleton');
    expect(html).not.toContain('Tracks');
    expect(html).not.toContain('os-route-skeleton');
  });

  it('reads a 280ms appear fallback without a document token', () => {
    expect(readMotionAppearMs()).toBe(280);
  });
});
