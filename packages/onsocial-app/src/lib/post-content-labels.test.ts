import { describe, expect, it } from 'vitest';
import {
  normalizeComposerContentLabels,
  parsePostContentLabels,
  postHasContentLabels,
  safeModePeekText,
  sensitiveGateLabel,
} from './post-content-labels';

describe('normalizeComposerContentLabels', () => {
  it('trims warning and omits empty / false fields', () => {
    expect(
      normalizeComposerContentLabels({
        contentWarning: '  spoilers  ',
        nsfw: false,
      })
    ).toEqual({ contentWarning: 'spoilers' });
    expect(normalizeComposerContentLabels({ nsfw: true })).toEqual({
      nsfw: true,
    });
    expect(normalizeComposerContentLabels({})).toEqual({});
  });
});

describe('parsePostContentLabels', () => {
  it('reads contentWarning and nsfw from PostV1 JSON', () => {
    expect(
      parsePostContentLabels(
        JSON.stringify({
          v: 1,
          text: 'x',
          contentWarning: 'spoiler',
          nsfw: true,
        })
      )
    ).toEqual({ contentWarning: 'spoiler', nsfw: true });
  });

  it('ignores invalid / missing labels', () => {
    expect(parsePostContentLabels('plain text')).toEqual({});
    expect(
      parsePostContentLabels(JSON.stringify({ v: 1, text: 'x', nsfw: 'yes' }))
    ).toEqual({});
  });
});

describe('sensitiveGateLabel', () => {
  it('prefers the author warning', () => {
    expect(
      sensitiveGateLabel({ contentWarning: 'Ending spoilers', nsfw: true })
    ).toBe('Ending spoilers');
    expect(sensitiveGateLabel({ nsfw: true })).toBe('Sensitive content');
  });

  it('detects when a gate is needed', () => {
    expect(postHasContentLabels({})).toBe(false);
    expect(postHasContentLabels({ nsfw: true })).toBe(true);
    expect(postHasContentLabels({ contentWarning: 'x' })).toBe(true);
  });
});

describe('safeModePeekText', () => {
  it('returns body text when Safe mode is off or unlabeled', () => {
    expect(safeModePeekText('hello', {}, true)).toBe('hello');
    expect(safeModePeekText('hello', { nsfw: true }, false)).toBe('hello');
  });

  it('replaces labeled body under Safe mode', () => {
    expect(
      safeModePeekText('secret ending', { contentWarning: 'Spoilers' }, true)
    ).toBe('Spoilers');
    expect(safeModePeekText('nsfw body', { nsfw: true }, true)).toBe(
      'Sensitive content'
    );
  });
});
