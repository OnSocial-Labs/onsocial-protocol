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
    expect(pushNotificationVerb('dm')).toBe('sent a private message');
  });
});

describe('pushNotificationUrl', () => {
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
});
