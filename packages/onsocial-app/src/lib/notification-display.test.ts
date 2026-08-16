import { describe, expect, it } from 'vitest';
import {
  formatNotificationTime,
  notificationDescription,
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
    expect(notificationVerb('boost_locked')).toBe('boost locked');
    expect(notificationVerb('dao_proposal')).toBe('opened a DAO proposal');
    expect(
      notificationVerb('dao_proposal_resolved', { status: 'Approved' })
    ).toBe('DAO proposal approved');
    expect(
      notificationVerb('reaction', {
        reactionValue: JSON.stringify({ type: 'like' }),
      })
    ).toBe('liked your post');
  });

  it('deep-links social, guild, dao, and dm notifications', () => {
    expect(
      notificationHref({
        type: 'reply',
        actor: 'bob.testnet',
        context: { parentPath: 'alice.testnet/post/9', postId: '10' },
      })
    ).toBe('/@alice.testnet/posts/9');

    expect(
      notificationHref({
        type: 'mention',
        actor: 'bob.testnet',
        context: {
          path: 'bob.testnet/post/3',
          groupId: 'guild.near',
        },
      })
    ).toBe('/groups/guild.near/posts/bob.testnet/3');

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

    expect(
      notificationHref({
        type: 'dao_proposal',
        actor: 'bob.testnet',
        context: {
          daoAccountId: 'gov.sputnik-dao.testnet',
          proposalId: 12,
          status: 'InProgress',
        },
      })
    ).toBe('/dao/gov.sputnik-dao.testnet?proposal=12');

    expect(
      notificationHref({
        type: 'dao_proposal_resolved',
        actor: 'gov.sputnik-dao.testnet',
        context: {
          daoAccountId: 'gov.sputnik-dao.testnet',
          proposalId: 12,
          status: 'Approved',
        },
      })
    ).toBe('/dao/gov.sputnik-dao.testnet?status=approved&proposal=12');
  });

  it('builds relative description lines', () => {
    const createdAt = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(
      notificationDescription({
        type: 'standing_new',
        context: {},
        createdAt,
      })
    ).toBe('stood with you · 5m ago');
    expect(formatNotificationTime(createdAt).label).toBe('5m ago');

    expect(
      notificationDescription({
        type: 'dao_proposal',
        context: {
          daoAccountId: 'gov.sputnik-dao.testnet',
          proposalId: 12,
          description: 'Fund builders',
        },
        createdAt,
      })
    ).toBe('opened a DAO proposal · Fund builders · 5m ago');

    expect(
      notificationDescription({
        type: 'dao_proposal_resolved',
        context: {
          status: 'Approved',
          description: 'Fund builders',
        },
        createdAt,
      })
    ).toBe('DAO proposal approved · Fund builders · 5m ago');
  });
});
