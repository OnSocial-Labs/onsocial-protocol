import { describe, expect, it } from 'vitest';
import { COMPOSER_THREAD_MAX_BEATS } from '@/lib/composer-thread';
import {
  allocateThreadPostIds,
  buildGuildThreadSetEntries,
  buildPersonalThreadSetEntries,
  canBatchComposerThread,
  COMPOSER_THREAD_EVENT_BUDGET_BYTES,
  estimateSetEventBytes,
  threadSetEntriesFitEventBudget,
} from '@/lib/composer-thread-batch';
import type { GuildSpace } from '@/features/guilds/guild-structure';

const space: GuildSpace = {
  id: 'general',
  title: 'General',
  kind: 'discussion',
  enabled: true,
  order: 0,
  audience: 'members',
  postPolicy: 'members',
};

describe('composer thread batch', () => {
  it('allocates consecutive ids from now', () => {
    expect(allocateThreadPostIds(3, 1000)).toEqual(['1000', '1001', '1002']);
  });

  it('batches text-only threads of 2–10 beats', () => {
    expect(
      canBatchComposerThread([{ text: 'one' }, { text: 'two' }])
    ).toBe(true);
    expect(canBatchComposerThread([{ text: 'one' }])).toBe(false);
    expect(
      canBatchComposerThread(
        Array.from({ length: COMPOSER_THREAD_MAX_BEATS + 1 }, (_, i) => ({
          text: `beat ${i}`,
        }))
      )
    ).toBe(false);
  });

  it('refuses file beats so uploads stay on sequential create/reply', () => {
    expect(
      canBatchComposerThread([
        { text: 'one' },
        {
          text: 'two',
          files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })],
        },
      ])
    ).toBe(false);
  });

  it('builds a personal root + self-reply chain', () => {
    const now = 1_700_000_000_000;
    const ids = allocateThreadPostIds(2, now);
    const { entries } = buildPersonalThreadSetEntries({
      accountId: 'alice.testnet',
      beats: [{ text: 'one' }, { text: 'two' }],
      ids,
      now,
    });
    expect(Object.keys(entries)).toEqual([`post/${ids[0]}`, `post/${ids[1]}`]);
    expect(entries[`post/${ids[0]}`]).toMatchObject({
      text: 'one',
      timestamp: now,
    });
    expect(entries[`post/${ids[1]}`]).toMatchObject({
      text: 'two',
      parent: `alice.testnet/post/${ids[0]}`,
      parentType: 'post',
    });
    expect(threadSetEntriesFitEventBudget(entries)).toBe(true);
  });

  it('builds a guild root + self-reply chain under content/', () => {
    const now = 1_700_000_000_000;
    const ids = allocateThreadPostIds(2, now);
    const { entries } = buildGuildThreadSetEntries({
      accountId: 'alice.testnet',
      groupId: 'builders',
      space,
      beats: [{ text: 'one' }, { text: 'two' }],
      ids,
      now,
    });
    expect(Object.keys(entries)).toEqual([
      `groups/builders/content/post/${ids[0]}`,
      `groups/builders/content/post/${ids[1]}`,
    ]);
    expect(entries[`groups/builders/content/post/${ids[0]}`]).toMatchObject({
      text: 'one',
      access: 'group',
      groupId: 'builders',
      channel: 'general',
    });
    expect(entries[`groups/builders/content/post/${ids[1]}`]).toMatchObject({
      text: 'two',
      parent: `alice.testnet/groups/builders/content/post/${ids[0]}`,
      parentType: 'post',
    });
  });

  it('flags a value that would blow the 16KB event line', () => {
    const fat = { text: 'x'.repeat(COMPOSER_THREAD_EVENT_BUDGET_BYTES) };
    expect(estimateSetEventBytes(fat)).toBeGreaterThan(
      COMPOSER_THREAD_EVENT_BUDGET_BYTES
    );
    expect(threadSetEntriesFitEventBudget({ 'post/1': fat })).toBe(false);
  });
});
