import { describe, expect, it } from 'vitest';
import { feedColumnSession } from './feed-column-session';

describe('feed column session', () => {
  it('covers the column only while a place screen is open', () => {
    expect(feedColumnSession(0)).toBeNull();
    expect(feedColumnSession(1)).toBe('covered');
    expect(feedColumnSession(2)).toBe('covered');
  });
});
