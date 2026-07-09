import { describe, expect, it } from 'vitest';
import {
  inheritedGuildReplyFeedMeta,
  parseGuildPostAudiences,
} from '@/features/guilds/guild-post-feed-meta';

describe('guild-post-feed-meta', () => {
  it('parses pipe-delimited audiences from indexer rows', () => {
    expect(parseGuildPostAudiences('|members|employees|')).toEqual([
      'members',
      'employees',
    ]);
    expect(parseGuildPostAudiences(undefined)).toEqual([]);
  });

  it('inherits channel from the reply target', () => {
    expect(
      inheritedGuildReplyFeedMeta({
        channel: 'shipping-room',
        kind: 'discussion',
        audiences: '|members|',
      })
    ).toEqual({
      channel: 'shipping-room',
      kind: 'discussion',
      audiences: 'members',
    });
  });

  it('falls back to thread root channel when the target lacks one', () => {
    expect(
      inheritedGuildReplyFeedMeta(
        { channel: undefined, kind: undefined, audiences: undefined },
        {
          fallbackChannel: 'shipping-room',
          fallbackKind: 'discussion',
          fallbackAudiences: ['members'],
        }
      )
    ).toEqual({
      channel: 'shipping-room',
      kind: 'discussion',
      audiences: 'members',
    });
  });

  it('returns empty metadata when no channel can be resolved', () => {
    expect(
      inheritedGuildReplyFeedMeta(
        { channel: undefined, kind: undefined, audiences: undefined },
        { fallbackChannel: null }
      )
    ).toEqual({});
  });

  it('parses string-array audiences from post rows', () => {
    expect(parseGuildPostAudiences(['members', 'employees'])).toEqual([
      'members',
      'employees',
    ]);
  });

  it('ignores non-string audience payloads safely', () => {
    expect(parseGuildPostAudiences(null)).toEqual([]);
    expect(parseGuildPostAudiences(42)).toEqual([]);
  });
});
