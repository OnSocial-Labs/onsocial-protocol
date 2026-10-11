import { describe, expect, it } from 'vitest';
import { immersiveTitleHandoff } from './immersive-title-handoff';

describe('immersiveTitleHandoff', () => {
  it('stays on the page until the name is one line from the bar', () => {
    expect(immersiveTitleHandoff(140, 100, 20)).toBe(0);
  });

  it('is partway through as the name meets the bar', () => {
    expect(immersiveTitleHandoff(100, 100, 20)).toBeCloseTo(40 / 60);
  });

  it('finishes once the name has passed under the bar', () => {
    expect(immersiveTitleHandoff(80, 100, 20)).toBe(1);
  });
});
