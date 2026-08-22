import { describe, expect, it } from 'vitest';
import {
  formatNotificationTime,
  isSystemNotification,
  notificationDescription,
  notificationDetail,
  notificationExplorerHref,
  notificationHref,
  notificationSystemChrome,
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
    expect(notificationVerb('reward_credited')).toBe('credited');
    expect(notificationVerb('reward_claimed')).toBe('collected');
    expect(notificationVerb('boost_reward_claimed')).toBe('boost claimed');
    expect(notificationVerb('dao_proposal')).toBe('opened a DAO proposal');
    expect(
      notificationVerb('dao_proposal_resolved', { status: 'Approved' })
    ).toBe('DAO proposal approved');
    expect(notificationVerb('repost')).toBe('reposted your post');
    expect(
      notificationVerb('dao_proposal_vote', { vote: 'Approve' })
    ).toBe('approved your DAO proposal');
    expect(
      notificationVerb('dao_proposal_vote', { vote: 'Reject' })
    ).toBe('rejected your DAO proposal');
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
    ).toBe('/@gov.sputnik-dao.testnet?status=open&proposal=12');

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
    ).toBe('/@gov.sputnik-dao.testnet?status=approved&proposal=12');

    expect(
      notificationHref({
        type: 'dao_proposal_vote',
        actor: 'carol.testnet',
        context: {
          daoAccountId: 'gov.sputnik-dao.testnet',
          proposalId: 12,
          status: 'InProgress',
          vote: 'Approve',
        },
      })
    ).toBe('/@gov.sputnik-dao.testnet?status=open&proposal=12');
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

    expect(
      notificationDescription({
        type: 'dao_proposal_vote',
        context: {
          vote: 'Approve',
          description: 'Fund builders',
        },
        createdAt,
      })
    ).toBe('approved your DAO proposal · Fund builders · 5m ago');
  });

  it('splits verb and DAO snippet without time', () => {
    expect(
      notificationDetail({
        type: 'standing_new',
        context: {},
      })
    ).toEqual({ verb: 'stood with you', snippet: null });
    expect(
      notificationDetail({
        type: 'dao_proposal',
        context: { description: 'Fund builders' },
      })
    ).toEqual({
      verb: 'opened a DAO proposal',
      snippet: 'Fund builders',
    });
  });

  it('classifies system chrome for boost / collect / dao resolved', () => {
    expect(
      isSystemNotification({
        type: 'boost_reward_claimed',
        actor: 'alice.testnet',
      })
    ).toBe(true);
    expect(
      isSystemNotification({
        type: 'standing_new',
        actor: 'bob.testnet',
      })
    ).toBe(false);
    expect(
      isSystemNotification({
        type: 'mention',
        actor: null,
      })
    ).toBe(true);
    expect(
      isSystemNotification({
        type: 'profile_anniversary',
        actor: '',
      })
    ).toBe(true);

    expect(
      notificationSystemChrome({
        type: 'boost_reward_claimed',
        context: {},
      })
    ).toEqual({
      family: 'boost',
      familyLabel: 'Boost',
      action: 'Claimed',
    });
    expect(
      notificationSystemChrome({
        type: 'reward_credited',
        context: {},
      })
    ).toEqual({
      family: 'collect',
      familyLabel: 'Collect',
      action: 'Credited',
    });
    expect(
      notificationSystemChrome({
        type: 'reward_claimed',
        context: {},
      })
    ).toEqual({
      family: 'collect',
      familyLabel: 'Collect',
      action: 'Collected',
    });
    expect(
      notificationSystemChrome({
        type: 'dao_proposal_resolved',
        context: { status: 'Approved' },
      })
    ).toEqual({
      family: 'dao',
      familyLabel: 'DAO',
      action: 'Proposal approved',
    });
    expect(
      notificationSystemChrome({
        type: 'profile_anniversary',
        context: { years: 3, accountId: 'alice.testnet' },
      })
    ).toEqual({
      family: 'onsocial',
      familyLabel: 'OnSocial',
      action: '3 years on OnSocial',
    });
    expect(
      notificationSystemChrome({
        type: 'profile_anniversary',
        context: { years: 1 },
      })
    ).toEqual({
      family: 'onsocial',
      familyLabel: 'OnSocial',
      action: '1 year on OnSocial',
    });
  });

  it('deep-links profile anniversary to the member portfolio', () => {
    expect(
      notificationHref({
        type: 'profile_anniversary',
        actor: '',
        recipient: 'alice.testnet',
        context: { years: 2, accountId: 'alice.testnet' },
      })
    ).toBe('/@alice.testnet');
  });

  it('builds Nearblocks href from receipt or context tx hash', () => {
    expect(
      notificationExplorerHref({
        source: { contract: 'core', receiptId: 'abc123', blockHeight: 1 },
        context: null,
      })
    ).toMatch(/\/txns\/abc123$/);
    expect(
      notificationExplorerHref({
        source: { contract: 'onsocial', receiptId: null, blockHeight: null },
        context: { txHash: 'def456' },
      })
    ).toMatch(/\/txns\/def456$/);
    expect(
      notificationExplorerHref({
        source: { contract: 'onsocial', receiptId: null, blockHeight: null },
        context: { years: 1 },
      })
    ).toBeNull();
  });
});
