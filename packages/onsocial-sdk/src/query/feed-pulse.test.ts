import { describe, expect, it } from 'vitest';
import type { PostRow } from './_shared.js';
import {
  assemblePulsePage,
  isCircleNativePost,
  attachPulseSelfReplyRoots,
  paginatePulseFunctionRows,
  parsePostRefFromContentPath,
  pulseParentRefsToHydrate,
  pulseSelfReplyRootsToHydrate,
  splitPulseFunctionRows,
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

  it('cards a nested reply on the thread root, not the mid-thread parent', () => {
    const nested = row('alice.near', 'r2', {
      parentPath: 'dave.near/post/mid',
      parentAuthor: 'dave.near',
      rootPath: 'bob.near/post/root',
      rootAuthor: 'bob.near',
      blockHeight: 40,
    });
    const page = assemblePulsePage({
      native: [native],
      bridges: [nested],
      parents: [stranger],
      accounts,
      sort: 'recent',
      offset: 0,
      limit: 20,
      take: 20,
    });
    expect(page.items.map((item) => item.postId)).toEqual([
      'root',
      'r2',
      'hello',
    ]);
  });

  it('collapses two nest levels in the same thread to one root card', () => {
    const onRoot = row('carol.near', 'r0', {
      parentPath: 'bob.near/post/root',
      parentAuthor: 'bob.near',
      rootPath: 'bob.near/post/root',
      blockHeight: 20,
    });
    const nested = row('alice.near', 'r2', {
      parentPath: 'dave.near/post/mid',
      parentAuthor: 'dave.near',
      rootPath: 'bob.near/post/root',
      blockHeight: 40,
    });
    const page = assemblePulsePage({
      native: [],
      bridges: [onRoot, nested],
      parents: [stranger],
      accounts,
      sort: 'recent',
      offset: 0,
      limit: 20,
      take: 20,
    });
    expect(page.items.map((item) => item.postId)).toEqual(['root', 'r2']);
  });

  it('folds a self-reply onto its root and ranks the card by the reply', () => {
    const selfReply = row('alice.near', 'note', {
      parentPath: 'alice.near/post/hello',
      parentAuthor: 'alice.near',
      rootPath: 'alice.near/post/hello',
      blockHeight: 50,
    });
    const page = assemblePulsePage({
      native: [native, selfReply],
      bridges: [reply],
      parents: [stranger],
      accounts,
      sort: 'recent',
      offset: 0,
      limit: 20,
      take: 20,
    });
    expect(page.items.map((item) => item.postId)).toEqual([
      'hello',
      'note',
      'root',
      'r1',
    ]);
  });

  it('pins a hydrated original when the self-reply root is off the native page', () => {
    const hello = row('alice.near', 'hello', { blockHeight: 15 });
    const selfReply = row('alice.near', 'note', {
      parentPath: 'alice.near/post/hello',
      parentAuthor: 'alice.near',
      blockHeight: 50,
    });
    const page = assemblePulsePage({
      native: [selfReply],
      bridges: [],
      parents: [hello],
      accounts,
      sort: 'recent',
      offset: 0,
      limit: 20,
      take: 20,
    });
    expect(page.items.map((item) => item.postId)).toEqual(['hello', 'note']);
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

describe('splitPulseFunctionRows', () => {
  const root = row('bob.near', 'root', { blockHeight: 10 });
  const peek = row('alice.near', 'r1', {
    parentPath: 'bob.near/post/root',
    parentAuthor: 'bob.near',
    rootPath: 'bob.near/post/root',
    blockHeight: 30,
  });
  const native = row('alice.near', 'hello', { blockHeight: 15 });

  it('keeps native cards as one row and bridges as root + peek', () => {
    const cards = splitPulseFunctionRows([root, peek, native], accounts);
    expect(cards.map((card) => card.map((item) => item.postId))).toEqual([
      ['root', 'r1'],
      ['hello'],
    ]);
  });

  it('pairs a native root with its newest self-reply', () => {
    const selfReply = row('alice.near', 'note', {
      parentPath: 'alice.near/post/hello',
      parentAuthor: 'alice.near',
      rootPath: 'alice.near/post/hello',
      blockHeight: 50,
    });
    const cards = splitPulseFunctionRows(
      [native, selfReply, root, peek],
      accounts
    );
    expect(cards.map((card) => card.map((item) => item.postId))).toEqual([
      ['hello', 'note'],
      ['root', 'r1'],
    ]);
  });

  it('pages SQL Pulse rows by cards', () => {
    const page = paginatePulseFunctionRows({
      rows: [root, peek, native],
      accounts,
      offset: 0,
      limit: 1,
    });
    expect(page.items.map((item) => item.postId)).toEqual(['root', 'r1']);
    expect(page.nextOffset).toBe(1);
  });
});

describe('attachPulseSelfReplyRoots', () => {
  it('pins a missing original in front of a lone self-reply card', () => {
    const hello = row('alice.near', 'hello', { blockHeight: 15 });
    const selfReply = row('alice.near', 'note', {
      parentPath: 'alice.near/post/hello',
      parentAuthor: 'alice.near',
      rootPath: 'alice.near/post/hello',
      blockHeight: 50,
    });
    const cards = attachPulseSelfReplyRoots([[selfReply]], [hello], accounts);
    expect(cards.map((card) => card.map((item) => item.postId))).toEqual([
      ['hello', 'note'],
    ]);
  });

  it('moves an on-page original up onto the self-reply card', () => {
    const hello = row('alice.near', 'hello', { blockHeight: 15 });
    const selfReply = row('alice.near', 'note', {
      parentPath: 'alice.near/post/hello',
      parentAuthor: 'alice.near',
      blockHeight: 50,
    });
    const other = row('carol.near', 'x', { blockHeight: 40 });
    const cards = attachPulseSelfReplyRoots(
      [[selfReply], [other], [hello]],
      [],
      accounts
    );
    expect(cards.map((card) => card.map((item) => item.postId))).toEqual([
      ['hello', 'note'],
      ['x'],
    ]);
  });
});

describe('pulseSelfReplyRootsToHydrate', () => {
  it('asks for a self-reply root that is not on the page', () => {
    const selfReply = row('alice.near', 'note', {
      parentPath: 'alice.near/post/hello',
      parentAuthor: 'alice.near',
    });
    expect(pulseSelfReplyRootsToHydrate([selfReply], accounts)).toEqual([
      { accountId: 'alice.near', postId: 'hello' },
    ]);
  });

  it('skips hydrate when the original is already on the page', () => {
    const hello = row('alice.near', 'hello');
    const selfReply = row('alice.near', 'note', {
      parentPath: 'alice.near/post/hello',
      parentAuthor: 'alice.near',
    });
    expect(pulseSelfReplyRootsToHydrate([selfReply, hello], accounts)).toEqual(
      []
    );
  });
});

describe('pulseParentRefsToHydrate', () => {
  it('hydrates the indexed root when a nested reply sets rootPath', () => {
    const refs = pulseParentRefsToHydrate(
      [
        row('alice.near', 'r2', {
          parentPath: 'dave.near/post/mid',
          parentAuthor: 'dave.near',
          rootPath: 'bob.near/post/root',
          rootAuthor: 'bob.near',
        }),
      ],
      accounts
    );
    expect(refs).toEqual([{ accountId: 'bob.near', postId: 'root' }]);
  });

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
