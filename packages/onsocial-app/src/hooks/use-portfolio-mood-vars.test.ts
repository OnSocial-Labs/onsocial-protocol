import { describe, expect, it } from 'vitest';
import { resolveCopiedMoodBg } from './use-portfolio-mood-vars';

describe('resolveCopiedMoodBg', () => {
  it('replaces Glass/Carbon transparent fills with the theme canvas', () => {
    expect(resolveCopiedMoodBg('transparent', '#ffffff')).toBe('#ffffff');
    expect(resolveCopiedMoodBg('rgba(0, 0, 0, 0)', '#000000')).toBe('#000000');
    expect(resolveCopiedMoodBg('', '#111')).toBe('#111');
  });

  it('keeps opaque mood washes', () => {
    expect(resolveCopiedMoodBg('rgb(20 24 40)', '#000')).toBe('rgb(20 24 40)');
  });
});
