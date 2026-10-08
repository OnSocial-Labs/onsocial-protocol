import { describe, expect, it } from 'vitest';
import { PROTOCOL_COLORS } from './protocol-colors.js';
import {
  blendProtocolSignalWithMood,
  MOOD_SIGNAL_PROTOCOL_WEIGHT,
  pageMoodSignalsFor,
  parseColorToRgb,
  PROTOCOL_SIGNAL_COLORS,
} from './mood-signals.js';

describe('mood signal blends', () => {
  it('keeps protocol mood at canonical signal hues', () => {
    const signals = pageMoodSignalsFor('protocol', PROTOCOL_COLORS.blue);

    expect(signals.standing).toBe(PROTOCOL_SIGNAL_COLORS.standing);
    expect(signals.solidarity).toBe(PROTOCOL_SIGNAL_COLORS.solidarity);
    expect(signals.endorse).toBe(PROTOCOL_SIGNAL_COLORS.endorse);
    expect(signals.reputation).toBe(PROTOCOL_SIGNAL_COLORS.reputation);
  });

  it('blends lead accent into reputation while keeping standing blue-leaning', () => {
    const accent = 'rgb(212 175 106 / 0.95)';
    const signals = pageMoodSignalsFor('lead', accent);

    expect(signals.standing).toMatch(/^rgb\(/);
    expect(signals.reputation).toMatch(/^rgb\(/);
    expect(signals.standing).not.toBe(signals.endorse);
    expect(signals.standing).not.toBe(accent);
    expect(MOOD_SIGNAL_PROTOCOL_WEIGHT.lead.reputation).toBeLessThan(
      MOOD_SIGNAL_PROTOCOL_WEIGHT.lead.standing
    );
  });

  it('keeps creative standing distinct from solidarity', () => {
    const accent = 'rgb(186 132 255 / 0.92)';
    const signals = pageMoodSignalsFor('creative', accent);

    expect(signals.standing).not.toBe(signals.solidarity);
  });

  it.each([
    ['summer', 'rgb(255 186 78 / 0.95)'],
    ['autumn', 'rgb(230 110 45 / 0.95)'],
  ] as const)('keeps %s standing blue-dominant', (mood, accent) => {
    const signals = pageMoodSignalsFor(mood, accent);
    const rgb = parseColorToRgb(signals.standing);

    expect(rgb).not.toBeNull();
    // Blue channel leads red and green so the standing identity survives the mood blend.
    expect(rgb![2]).toBeGreaterThan(rgb![0]);
    expect(rgb![2]).toBeGreaterThan(rgb![1]);
  });

  it('linear blend returns protocol color at weight 1', () => {
    expect(
      blendProtocolSignalWithMood(
        PROTOCOL_SIGNAL_COLORS.reputation,
        '#ff00aa',
        1
      )
    ).toBe(PROTOCOL_SIGNAL_COLORS.reputation);
  });
});
