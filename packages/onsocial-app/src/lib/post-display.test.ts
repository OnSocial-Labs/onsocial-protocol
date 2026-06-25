import { describe, expect, it } from 'vitest';
import { parsePostText } from './post-display';

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
