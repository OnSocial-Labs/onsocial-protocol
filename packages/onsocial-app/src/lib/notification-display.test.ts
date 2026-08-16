import { describe, expect, it } from 'vitest';
import {
  notificationHref,
  notificationVerb,
  parseNotificationPostPath,
} from '@/lib/notification-display';

describe('notification display', () => {
  it('parses post content paths', () => {
    expect(parseNotificationPostPath('alice.testnet/post/42')).toEqual({
      author: 'alice.testnet',
      postId: '42',
    });
    expect(parseNotificationPostPath('bad')).toBeNull();
  });

  it('maps verbs', () => {
    expect(notificationVerb('standing_new')).toBe('stood with you');
    expect(notificationVerb('dm')).toBe('sent a private message');
  });

  it('deep-links social and dm notifications', () => {
    expect(
      notificationHref({
        type: 'reply',
        actor: 'bob.testnet',
        context: { parentPath: 'alice.testnet/post/9', postId: '10' },
      })
    ).toBe('/@alice.testnet/posts/9');

    expect(
      notificationHref({
        type: 'dm',
        actor: 'bob.testnet',
        context: { threadId: 'alice.testnet::bob.testnet' },
      })
    ).toBe('/messages?thread=alice.testnet%3A%3Abob.testnet');

    expect(
      notificationHref({
        type: 'standing_new',
        actor: 'bob.testnet',
        context: {},
      })
    ).toBe('/@bob.testnet');

    expect(
      notificationHref({
        type: 'group_proposal',
        actor: 'bob.testnet',
        context: { groupId: 'guild.near' },
      })
    ).toBe('/groups/guild.near/proposals');
  });
});
