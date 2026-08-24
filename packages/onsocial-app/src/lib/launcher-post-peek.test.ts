import { describe, expect, it } from 'vitest';
import type { PostRow } from '@onsocial/sdk';
import {
  formatLauncherRelationTarget,
  launcherRepostAttributionLabel,
  launcherRelationLead,
  resolveLauncherPostPeekDisplay,
} from '@/lib/launcher-post-peek';

describe('launcher-post-peek', () => {
  it('avoids repeating the reposter name in attribution', () => {
    expect(
      launcherRepostAttributionLabel({
        reposterAccountId: 'test05.testnet',
        reposterDisplayName: 'Test05_onsocial new',
        viewerAccountId: 'other.testnet',
        contentAccountId: 'test05.testnet',
      })
    ).toBe('Reposted');
    expect(
      launcherRepostAttributionLabel({
        reposterAccountId: 'test05.testnet',
        reposterDisplayName: 'Test05_onsocial new',
        viewerAccountId: 'test05.testnet',
        contentAccountId: 'test05.testnet',
      })
    ).toBe('You reposted');
    expect(
      launcherRepostAttributionLabel({
        reposterAccountId: 'alice.testnet',
        reposterDisplayName: 'Alice',
        viewerAccountId: null,
        contentAccountId: 'bob.testnet',
      })
    ).toBe('Alice reposted');
  });

  it('renders bare repost shells like the feed — original author + poll question', () => {
    const original: PostRow = {
      accountId: 'bob.testnet',
      postId: 'p1',
      value: JSON.stringify({
        v: 1,
        text: '',
        embeds: [
          {
            kind: 'poll',
            question: 'Favourite colour?',
            options: ['Red', 'Blue'],
          },
        ],
      }),
      blockHeight: 1,
      blockTimestamp: 1,
      groupId: 'grp_test',
    };

    const display = resolveLauncherPostPeekDisplay({
      peek: {
        author: 'test05.testnet',
        postId: 'repost-1',
        value: '',
        blockTimestamp: 2,
        href: '/groups/grp_test/post/repost-1',
        refType: 'repost',
        refPath: 'bob.testnet/groups/grp_test/content/post/p1',
        kind: 'poll',
      },
      resolvedByPath: {
        'bob.testnet/groups/grp_test/content/post/p1': original,
      },
      viewerAccountId: 'test05.testnet',
      authorDisplayName: 'Test05_onsocial new',
    });

    expect(display.repostAttribution).toBe('You reposted');
    expect(display.accountId).toBe('bob.testnet');
    expect(display.excerpt).toBe('Favourite colour?');
    expect(display.relation).toBeNull();
  });

  it('formats reply targets with name and handle when profile is known', () => {
    const target = formatLauncherRelationTarget('bob.near', 'Bob');
    expect(target.label).toBe('Bob @bob.near');
    expect(
      launcherRelationLead({
        relation: { kind: 'reply', verb: 'Replying to', handle: 'bob.near' },
        relationTargetProfileName: 'Bob',
      })
    ).toBe('Replying to Bob @bob.near');
  });
});
