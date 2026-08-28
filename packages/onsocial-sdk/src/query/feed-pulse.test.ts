import { describe, expect, it } from 'vitest';
import type { PostRow } from './_shared.js';
import {
  assemblePulsePage,
  isCircleNativePost,
  parsePostRefFromContentPath,
  pulseParentRefsToHydrate,
} from './feed-pulse.js';

function row(
  accountId: string,
  postId: string,
  extra: Partial<PostRow> = {}
): PostRow {
  return {
    accountId,
    postId,
    value: '{}',
    blockHeight: extra.blockHeight ?? 1,
    blockTimestamp: extra.blockTimestamp ?? 1,
    ...extra,
  };
}

const accounts = ['alice.near', 'carol.near'];

describe('parsePostRefFromContentPath', () => {
  it('parses personal and group paths', () => {
    expect(parsePostRefFromContentPath('bob.near/post/root')).toEqual({
      accountId: 'bob.near',
      postId: 'root',
    });
    expect(
      parsePostRefFromContentPath('bob.near/groups/dao/content/post/g1')
    ).toEqual({
      accountId: 'bob.near',
      postId: 'g1',
      groupId: 'dao',
    });
    expect(parsePostRefFromContentPath('')).toBeNull();
  });
});

describe('isCircleNativePost', () => {
  const set = new Set(accounts);

  it('treats roots and circle-to-circle replies as native', () => {
    expect(isCircleNativePost(row('alice.near', 'p1'), set)).toBe(true);
    expect(
      isCircleNativePost(
        row('alice.near', 'r1', {
          parentPath: 'carol.near/post/p',
          parentAuthor: 'carol.near',
        }),
        set
      )
    ).toBe(true);
  });

  it('treats replies to outsiders as bridges', () => {
    expect(
      isCircleNativePost(
        row('alice.near', 'r1', {
          parentPath: 'bob.near/post/root',
          parentAuthor: 'bob.near',
        }),
        set
      )
    ).toBe(false);
  });
});

describe('assemblePulsePage', () => {
  const stranger = row('bob.near', 'root', { blockHeight: 10 });
  const reply = row('alice.near', 'r1', {
    parentPath: 'bob.near/post/root',
    parentAuthor: 'bob.near',
    blockHeight: 30,
  });
  const olderReply = row('carol.near', 'r0', {
    parentPath: 'bob.near/post/root',
    parentAuthor: 'bob.near',
    blockHeight: 20,
  });
  const native = row('alice.near', 'hello', { blockHeight: 15 });

  it('returns native-only when there are no bridges', () => {
    const page = assemblePulsePage({
      native: [native],
      bridges: [],
      parents: [],
      accounts,
      sort: 'recent',
      offset: 0,
      limit: 20,
      take: 20,
    });
    expect(page.items).toEqual([native]);
    expect(page.nextOffset).toBeUndefined();
  });

  it('unions a stranger parent with the newest circle reply', () => {
    const page = assemblePulsePage({
      native: [native],
      bridges: [olderReply, reply],
      parents: [stranger],
      accounts,
      sort: 'recent',
      offset: 0,
      limit: 20,
      take: 20,
    });
    expect(page.items).toEqual([stranger, reply, native]);
    expect(page.nextOffset).toBeUndefined();
  });

  it('ranks a bridge by the reply, not the old parent', () => {
    const coldParent = row('bob.near', 'old', {
      blockHeight: 1,
      amplifyHeat: 0,
    });
    const hotReply = row('alice.near', 'hot', {
      parentPath: 'bob.near/post/old',
      parentAuthor: 'bob.near',
      blockHeight: 50,
      amplifyHeat: 9,
    });
    const warmNative = row('alice.near', 'own', {
      blockHeight: 40,
      amplifyHeat: 2,
    });
    const page = assemblePulsePage({
      native: [warmNative],
      bridges: [hotReply],
      parents: [coldParent],
      accounts,
      sort: 'hot',
      offset: 0,
      limit: 20,
      take: 20,
    });
    expect(page.items.map((item) => item.postId)).toEqual([
      'old',
      'hot',
      'own',
    ]);
  });

  it('pages by cards so Pulse is not the same as native-only Circle', () => {
    const page = assemblePulsePage({
      native: [native],
      bridges: [reply],
      parents: [stranger],
      accounts,
      sort: 'recent',
      offset: 0,
      limit: 1,
      take: 1,
    });
    expect(page.items).toEqual([stranger, reply]);
    expect(page.nextOffset).toBe(1);
  });

  it('skips a bridge when the parent did not hydrate', () => {
    const page = assemblePulsePage({
      native: [native],
      bridges: [reply],
      parents: [],
      accounts,
      sort: 'recent',
      offset: 0,
      limit: 20,
      take: 20,
    });
    expect(page.items).toEqual([native]);
  });
});

describe('pulseParentRefsToHydrate', () => {
  it('dedupes parent paths from foreign replies', () => {
    const refs = pulseParentRefsToHydrate(
      [
        row('alice.near', 'r1', {
          parentPath: 'bob.near/post/root',
          parentAuthor: 'bob.near',
        }),
        row('carol.near', 'r2', {
          parentPath: 'bob.near/post/root',
          parentAuthor: 'bob.near',
        }),
        row('alice.near', 'own', {}),
      ],
      accounts
    );
    expect(refs).toEqual([{ accountId: 'bob.near', postId: 'root' }]);
  });
});
