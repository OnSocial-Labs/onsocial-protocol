import { describe, expect, it } from 'vitest';
import { parseTypeList } from '../../src/services/notifications/index.js';

describe('parseTypeList', () => {
  it('parses a single include type', () => {
    expect(parseTypeList('mention')).toEqual(['mention']);
  });

  it('parses a comma-separated include list', () => {
    expect(parseTypeList('mention,reply')).toEqual(['mention', 'reply']);
  });

  it('trims blanks and drops empty tokens', () => {
    expect(parseTypeList(' mention, ,reply ')).toEqual(['mention', 'reply']);
  });

  it('dedupes repeated kinds', () => {
    expect(parseTypeList('reply,mention,reply')).toEqual(['reply', 'mention']);
  });

  it('returns an empty list when unset', () => {
    expect(parseTypeList(undefined)).toEqual([]);
    expect(parseTypeList('')).toEqual([]);
  });
});
