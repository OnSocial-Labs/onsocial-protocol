import { describe, expect, it } from 'vitest';
import type { Notification } from '@onsocial/sdk';
import {
  activityGroupVerb,
  groupActivityNotifications,
  isActivityStandGroup,
} from '@/lib/activity-notification-groups';

function row(
  partial: Pick<Notification, 'id' | 'type' | 'createdAt'> &
    Partial<Pick<Notification, 'actor' | 'context'>>
): Notification {
  return {
    recipient: 'alice.testnet',
    actor: partial.actor ?? 'bob.testnet',
    read: false,
    source: { contract: null, receiptId: null, blockHeight: null },
    context: partial.context ?? {},
    dedupeKey: partial.id,
    ...partial,
  };
}

const like = {
  reactionTargetPath: 'alice.testnet/post/9',
  reactionValue: JSON.stringify({ type: 'like' }),
};

describe('groupActivityNotifications', () => {
  it('folds same-day likes of one post and leaves mentions alone', () => {
    const groups = groupActivityNotifications([
      row({
        id: 'like-new',
        type: 'reaction',
        actor: 'carol.testnet',
        createdAt: '2026-09-10T09:00:00.000Z',
        context: like,
      }),
      row({
        id: 'mention',
        type: 'mention',
        createdAt: '2026-09-10T08:30:00.000Z',
        context: { text: 'hi' },
      }),
      row({
        id: 'like-old',
        type: 'reaction',
        actor: 'dave.testnet',
        createdAt: '2026-09-10T08:00:00.000Z',
        context: like,
      }),
    ]);

    expect(groups.map((group) => group.map((item) => item.id))).toEqual([
      ['like-new', 'like-old'],
      ['mention'],
    ]);
    expect(activityGroupVerb(groups[0])).toBe('and 1 other liked your post');
  });

  it('does not fold a like from another day or another post', () => {
    const groups = groupActivityNotifications([
      row({
        id: 'today',
        type: 'reaction',
        createdAt: '2026-09-10T09:00:00.000Z',
        context: like,
      }),
      row({
        id: 'other-post',
        type: 'reaction',
        createdAt: '2026-09-10T08:00:00.000Z',
        context: { ...like, reactionTargetPath: 'alice.testnet/post/3' },
      }),
      row({
        id: 'yesterday',
        type: 'reaction',
        createdAt: '2026-09-09T09:00:00.000Z',
        context: like,
      }),
    ]);

    expect(groups.map((group) => group.map((item) => item.id))).toEqual([
      ['today'],
      ['other-post'],
      ['yesterday'],
    ]);
  });

  it('folds stands from the same day', () => {
    const groups = groupActivityNotifications([
      row({
        id: 'stand-1',
        type: 'standing_new',
        createdAt: '2026-09-10T09:00:00.000Z',
      }),
      row({
        id: 'stand-2',
        type: 'standing_new',
        actor: 'carol.testnet',
        createdAt: '2026-09-10T07:00:00.000Z',
      }),
      row({
        id: 'stand-3',
        type: 'standing_new',
        createdAt: '2026-09-10T06:00:00.000Z',
      }),
    ]);

    expect(groups).toHaveLength(1);
    expect(activityGroupVerb(groups[0])).toBe('and 2 others stood with you');
  });

  it('opens a sheet only for several stands', () => {
    const stands = [
      row({
        id: 'stand-1',
        type: 'standing_new',
        createdAt: '2026-09-10T09:00:00.000Z',
      }),
      row({
        id: 'stand-2',
        type: 'standing_new',
        actor: 'carol.testnet',
        createdAt: '2026-09-10T07:00:00.000Z',
      }),
    ];
    expect(isActivityStandGroup(stands)).toBe(true);
    expect(isActivityStandGroup(stands.slice(0, 1))).toBe(false);
    expect(
      isActivityStandGroup([
        row({
          id: 'like',
          type: 'reaction',
          createdAt: '2026-09-10T09:00:00.000Z',
          context: like,
        }),
        row({
          id: 'like-2',
          type: 'reaction',
          createdAt: '2026-09-10T08:00:00.000Z',
          context: like,
        }),
      ])
    ).toBe(false);
  });

  it('keeps a single gesture on its own verb', () => {
    expect(
      activityGroupVerb([
        row({
          id: 'one',
          type: 'repost',
          createdAt: '2026-09-10T09:00:00.000Z',
          context: { path: 'alice.testnet/post/9' },
        }),
      ])
    ).toBe('reposted your post');
  });
});
