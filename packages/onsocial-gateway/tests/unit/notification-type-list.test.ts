import { describe, expect, it } from 'vitest';
import {
  notificationTypeFilterClause,
  parseTypeList,
} from '../../src/services/notifications/index.js';

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

describe('notificationTypeFilterClause', () => {
  it('combines a type filter and an exclude filter on one field', () => {
    const clause = notificationTypeFilterClause(
      ['mention', 'reply'],
      ['dm', 'reward_claimed']
    );
    expect(clause).toBe(
      'notificationType: { _in: $includeTypes, _nin: $excludeTypes }'
    );
    expect(clause?.match(/notificationType/g)).toHaveLength(1);
  });

  it('keeps a lone include or exclude', () => {
    expect(notificationTypeFilterClause(['mention'], [])).toBe(
      'notificationType: { _in: $includeTypes }'
    );
    expect(notificationTypeFilterClause([], ['dm'])).toBe(
      'notificationType: { _nin: $excludeTypes }'
    );
    expect(notificationTypeFilterClause([], [])).toBeNull();
  });
});
