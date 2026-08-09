import { describe, expect, it } from 'vitest';
import { resolveScarceFeedMediumMode } from '@/features/scarces/scarce-feed-medium-mode';

describe('resolveScarceFeedMediumMode', () => {
  it('maps audio / writing / other to shell modes', () => {
    expect(resolveScarceFeedMediumMode('audio')).toBe('audio');
    expect(resolveScarceFeedMediumMode('music')).toBe('audio');
    expect(resolveScarceFeedMediumMode('writing')).toBe('writing');
    expect(resolveScarceFeedMediumMode('article')).toBe('writing');
    expect(resolveScarceFeedMediumMode('book')).toBe('writing');
    expect(resolveScarceFeedMediumMode('art')).toBe('viewer');
    expect(resolveScarceFeedMediumMode('thought')).toBe('viewer');
    expect(resolveScarceFeedMediumMode(null)).toBe('viewer');
  });
});
