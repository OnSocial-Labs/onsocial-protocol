import { describe, expect, it } from 'vitest';
import {
  formatPostTimestamp,
  parsePostText,
  postTimestampIso,
} from './post-display';

describe('parsePostText', () => {
  it('reads text from schema v1 post bodies', () => {
    expect(parsePostText(JSON.stringify({ v: 1, text: 'hello world' }))).toBe(
      'hello world'
    );
  });

  it('falls back to raw value when not JSON', () => {
    expect(parsePostText('plain post')).toBe('plain post');
  });
});

describe('post timestamps', () => {
  it('formats valid second and millisecond timestamps', () => {
    expect(postTimestampIso(1_783_220_970)).toBe(
      new Date(1_783_220_970_000).toISOString()
    );
    expect(postTimestampIso(1_783_220_970_000)).toBe(
      new Date(1_783_220_970_000).toISOString()
    );
  });

  it('does not produce invalid ISO strings for missing timestamps', () => {
    expect(postTimestampIso(0)).toBeUndefined();
    expect(postTimestampIso(Number.NaN)).toBeUndefined();
    expect(formatPostTimestamp(0)).toBe('Unknown time');
  });
});
