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
  it('formats valid second, millisecond, microsecond, and nanosecond timestamps', () => {
    const expected = new Date(1_783_220_970_000).toISOString();

    expect(postTimestampIso(1_783_220_970)).toBe(expected);
    expect(postTimestampIso(1_783_220_970_000)).toBe(expected);
    expect(postTimestampIso(1_783_220_970_000_000)).toBe(expected);
    expect(postTimestampIso(1_783_220_970_000_000_000)).toBe(expected);
  });

  it('formats numeric timestamp strings from GraphQL bigint values', () => {
    expect(postTimestampIso('1783220970000000000')).toBe(
      new Date(1_783_220_970_000).toISOString()
    );
  });

  it('does not produce invalid ISO strings for missing timestamps', () => {
    expect(postTimestampIso(0)).toBeUndefined();
    expect(postTimestampIso(Number.NaN)).toBeUndefined();
    expect(formatPostTimestamp(0)).toBe('Unknown time');
  });
});
