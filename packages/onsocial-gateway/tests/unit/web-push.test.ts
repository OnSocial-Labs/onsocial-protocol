import { describe, expect, it } from 'vitest';
import {
  buildWebPushPayload,
  pushNotificationUrl,
  pushNotificationVerb,
} from '../../src/services/notifications/web-push.js';

describe('pushNotificationVerb', () => {
  it('maps core social types', () => {
    expect(pushNotificationVerb('reply')).toBe('replied to your post');
    expect(pushNotificationVerb('repost')).toBe('reposted your post');
    expect(pushNotificationVerb('standing_new')).toBe('stood with you');
    expect(pushNotificationVerb('endorsement_new')).toBe('endorsed you');
    expect(pushNotificationVerb('endorsement_supported')).toBe(
      'supported your endorsement'
    );
    expect(pushNotificationVerb('profile_supported')).toBe('supported you');
    expect(pushNotificationVerb('dm')).toBe('sent a private message');
  });

  it('maps profile anniversary years', () => {
    expect(pushNotificationVerb('profile_anniversary', { years: 1 })).toBe(
      '1 year on OnSocial'
    );
    expect(pushNotificationVerb('profile_anniversary', { years: 4 })).toBe(
      '4 years on OnSocial'
    );
  });

  it('maps collect and boost verbs without reward wording', () => {
    expect(pushNotificationVerb('reward_credited')).toBe('SOCIAL credited');
    expect(pushNotificationVerb('reward_claimed')).toBe('SOCIAL collected');
    expect(pushNotificationVerb('boost_reward_claimed')).toBe(
      'boost collected'
    );
    expect(pushNotificationVerb('dao_proposal')).toBe('opened a proposal');
    expect(
      pushNotificationVerb('dao_proposal_resolved', { status: 'Approved' })
    ).toBe('Proposal approved');
  });
});

describe('pushNotificationUrl', () => {
  it('deep-links endorsement to the recipient face focus', () => {
    expect(
      pushNotificationUrl({
        notification_type: 'endorsement_new',
        actor: 'alice.near',
        recipient: 'bob.near',
        context: { targetAccount: 'bob.near' },
      })
    ).toBe('/@bob.near?issuer=alice.near');
    expect(
      pushNotificationUrl({
        notification_type: 'endorsement_supported',
        actor: 'carol.near',
        recipient: 'bob.near',
        context: {
          targetAccount: 'bob.near',
          targetId: 'legacy:alice.near:bob.near:design',
          issuer: 'alice.near',
        },
      })
    ).toBe('/@bob.near?endorsement=legacy%3Aalice.near%3Abob.near%3Adesign');
  });

  it('deep-links DMs to messages', () => {
    expect(
      pushNotificationUrl({
        notification_type: 'dm',
        actor: 'alice.near',
        context: { threadId: 't1' },
      })
    ).toBe('/messages?thread=t1');
  });

  it('deep-links DAO proposals to portfolio', () => {
    expect(
      pushNotificationUrl({
        notification_type: 'dao_proposal_vote',
        actor: 'voter.near',
        context: { daoAccountId: 'dao.near', proposalId: 12 },
      })
    ).toBe('/@dao.near?proposal=12');
  });

  it('deep-links guild proposals to the live sheet', () => {
    expect(
      pushNotificationUrl({
        notification_type: 'group_proposal',
        actor: 'alice.near',
        context: { groupId: 'guild.near' },
      })
    ).toBe('/groups/guild.near?sheet=proposals');
  });

  it('deep-links profile anniversary to recipient portfolio', () => {
    expect(
      pushNotificationUrl({
        notification_type: 'profile_anniversary',
        actor: '',
        recipient: 'alice.near',
        context: { years: 2, accountId: 'alice.near' },
      })
    ).toBe('/@alice.near');
  });

  it('deep-links replies to the post and boost to the owner sheet', () => {
    expect(
      pushNotificationUrl({
        notification_type: 'reply',
        actor: 'bob.near',
        context: { parentPath: 'alice.near/post/9', postId: '10' },
      })
    ).toBe('/@alice.near/posts/9');
    expect(
      pushNotificationUrl({
        notification_type: 'boost_locked',
        actor: 'alice.near',
        recipient: 'alice.near',
        context: {},
      })
    ).toBe('/@alice.near?sheet=boost');
    expect(
      pushNotificationUrl({
        notification_type: 'reward_claimed',
        actor: 'alice.near',
        recipient: 'alice.near',
        context: {},
      })
    ).toBe('/home?sheet=wallet');
    expect(
      pushNotificationUrl({
        notification_type: 'scarces_sold',
        actor: 'bob.near',
        context: { collectionId: 'night-drive' },
      })
    ).toBe('/collection/night-drive');
  });

  it('falls back to activity inbox', () => {
    expect(
      pushNotificationUrl({
        notification_type: 'app_event',
        actor: '',
        context: {},
      })
    ).toBe('/notifications');
  });
});

describe('buildWebPushPayload', () => {
  it('builds title, body, tag from notification row', () => {
    const payload = buildWebPushPayload({
      id: '11111111-1111-1111-1111-111111111111',
      recipient: 'bob.near',
      actor: 'alice.near',
      notification_type: 'mention',
      context: {},
    });
    expect(payload).toEqual({
      title: 'alice.near',
      body: 'mentioned you',
      url: '/@alice.near',
      tag: 'onsocial-notif-11111111-1111-1111-1111-111111111111',
      notificationId: '11111111-1111-1111-1111-111111111111',
    });
  });

  it('titles anniversary pushes as OnSocial', () => {
    const payload = buildWebPushPayload({
      id: '22222222-2222-2222-2222-222222222222',
      recipient: 'alice.near',
      actor: '',
      notification_type: 'profile_anniversary',
      context: { years: 3, accountId: 'alice.near' },
    });
    expect(payload).toEqual({
      title: 'OnSocial',
      body: '3 years on OnSocial',
      url: '/@alice.near',
      tag: 'onsocial-notif-22222222-2222-2222-2222-222222222222',
      notificationId: '22222222-2222-2222-2222-222222222222',
    });
  });

  it('titles collect and boost pushes by family', () => {
    expect(
      buildWebPushPayload({
        id: '33333333-3333-3333-3333-333333333333',
        recipient: 'alice.near',
        actor: 'alice.near',
        notification_type: 'reward_claimed',
        context: {},
      })
    ).toMatchObject({
      title: 'Collect',
      body: 'SOCIAL collected',
    });
    expect(
      buildWebPushPayload({
        id: '44444444-4444-4444-4444-444444444444',
        recipient: 'alice.near',
        actor: 'alice.near',
        notification_type: 'boost_reward_claimed',
        context: {},
      })
    ).toMatchObject({
      title: 'Boost',
      body: 'boost collected',
    });
  });
});
