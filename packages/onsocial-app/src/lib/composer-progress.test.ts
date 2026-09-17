import { describe, expect, it } from 'vitest';
import {
  composerProgressLabel,
  countComposerWords,
} from './composer-progress';

describe('countComposerWords', () => {
  it('counts trimmed words', () => {
    expect(countComposerWords('')).toBe(0);
    expect(countComposerWords('  ')).toBe(0);
    expect(countComposerWords('one')).toBe(1);
    expect(countComposerWords('  one  two\nthree  ')).toBe(3);
  });
});

describe('composerProgressLabel', () => {
  it('shows words for articles', () => {
    expect(
      composerProgressLabel({
        articleMode: true,
        text: 'Hello world',
        textRemaining: 3900,
        showTextCount: true,
      })
    ).toBe('2 words');
  });

  it('falls back to chars left for posts', () => {
    expect(
      composerProgressLabel({
        articleMode: false,
        text: 'Hi',
        textRemaining: 3998,
        showTextCount: true,
      })
    ).toBe('3998');
  });

  it('stays idle when empty', () => {
    expect(
      composerProgressLabel({
        articleMode: false,
        text: '',
        textRemaining: 4000,
        showTextCount: false,
      })
    ).toBeNull();
  });
});
