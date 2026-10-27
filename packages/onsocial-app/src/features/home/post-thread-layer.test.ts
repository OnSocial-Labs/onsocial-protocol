import { describe, expect, it } from 'vitest';
import { parseInAppDropLayerHref } from '@/lib/app-routes';
import {
  parseInAppPostLayerHref,
  parseInAppPostQuotesHref,
  type PostQuotesTab,
} from '@/lib/post-routes';
import { isPortfolioFaceHref } from './post-thread-layer';
import {
  appendTrailEntry,
  collapseTrailToTop,
  isReaderLayerKind,
  isSameReaderTarget,
  PLACE_LAYER_KINDS,
  replaceStackWith,
  retabTopQuotes,
  walkBackOneStep,
  type DropStackEntry,
  type PostStackEntry,
  type QuotesStackEntry,
} from './post-thread-stack';

let seq = 0;

function postEntry(accountId: string, postId: string): PostStackEntry {
  seq += 1;
  return {
    id: `post-${seq}`,
    kind: 'post',
    accountId,
    postId,
    groupId: null,
    zIndex: 100,
  };
}

function quotesEntry(
  accountId: string,
  postId: string,
  tab: PostQuotesTab = 'quotes'
): QuotesStackEntry {
  seq += 1;
  return {
    id: `quotes-${seq}`,
    kind: 'quotes',
    accountId,
    postId,
    groupId: null,
    tab,
    zIndex: 100,
  };
}

function dropEntry(collectionId: string): DropStackEntry {
  seq += 1;
  return { id: `drop-${seq}`, kind: 'drop', collectionId, zIndex: 100 };
}

describe('thread trail stack', () => {
  it('keeps every trail sheet mounted when a reply opens over the thread', () => {
    const root = postEntry('alice.testnet', '1');
    const reply = postEntry('bob.testnet', '9');

    const trail = appendTrailEntry([root], reply);

    expect(trail).toHaveLength(2);
    // Stable identities — React keys keep both sheets mounted (parked).
    expect(trail[0]).toBe(root);
    expect(trail[1]).toBe(reply);
    expect(
      appendTrailEntry(trail, quotesEntry('alice.testnet', '1'))
    ).toHaveLength(3);
  });

  it('steps the header back one layer at a time: reply, quotes, post', () => {
    const post = postEntry('alice.testnet', '1');
    const reply = postEntry('bob.testnet', '9');
    const quotes = quotesEntry('alice.testnet', '1');

    expect(walkBackOneStep([post, reply, quotes])).toEqual([post, reply]);
    expect(walkBackOneStep([post, reply])).toEqual([post]);
    // Last step: the sheet itself closes.
    expect(walkBackOneStep([post])).toBeNull();
    expect(
      walkBackOneStep([postEntry('a.testnet', '1'), dropEntry('c1')])
    ).toBeNull();
  });

  it('drops the trail behind the open sheet on browser back', () => {
    const post = postEntry('alice.testnet', '1');
    const reply = postEntry('bob.testnet', '9');

    expect(collapseTrailToTop([post, reply])).toEqual([reply]);
    expect(collapseTrailToTop([post])).toEqual([post]);
  });

  it('a drop takes over the host instead of stacking over readers', () => {
    expect(isReaderLayerKind('post')).toBe(true);
    expect(isReaderLayerKind('quotes')).toBe(true);
    expect(isReaderLayerKind('drop')).toBe(false);

    const drop = dropEntry('writers-chest');
    expect(replaceStackWith(drop)).toEqual([drop]);
  });

  it('treats re-opening the reader already on top as a no-op', () => {
    const post = postEntry('alice.testnet', '1');

    expect(
      isSameReaderTarget(post, {
        kind: 'post',
        accountId: 'ALICE.testnet',
        postId: '1',
        groupId: null,
      })
    ).toBe(true);
    expect(
      isSameReaderTarget(post, {
        kind: 'post',
        accountId: 'alice.testnet',
        postId: '2',
        groupId: null,
      })
    ).toBe(false);
    // Same post, different surface — quotes over post must stack.
    expect(
      isSameReaderTarget(post, {
        kind: 'quotes',
        accountId: 'alice.testnet',
        postId: '1',
        groupId: null,
      })
    ).toBe(false);
    expect(
      isSameReaderTarget(dropEntry('c1'), {
        kind: 'post',
        accountId: 'alice.testnet',
        postId: '1',
        groupId: null,
      })
    ).toBe(false);
  });

  it('retabs the open quotes screen in place without growing the stack', () => {
    const post = postEntry('alice.testnet', '1');
    const quotes = quotesEntry('alice.testnet', '1', 'quotes');

    const retabbed = retabTopQuotes([post, quotes], 'reposts');

    expect(retabbed).toHaveLength(2);
    expect(retabbed[0]).toBe(post);
    expect(retabbed[1]).toMatchObject({ kind: 'quotes', tab: 'reposts' });
    expect(retabbed[1]).not.toBe(quotes);
  });
});

describe('article place layer discipline', () => {
  it('stacks only post readers, quotes, and drops', () => {
    expect([...PLACE_LAYER_KINDS].sort()).toEqual(['drop', 'post', 'quotes']);
  });

  it('opens a guest Writing permalink as a plain post layer', () => {
    expect(parseInAppPostLayerHref('/@alice.testnet/writing/essay-1')).toEqual({
      accountId: 'alice.testnet',
      postId: 'essay-1',
    });
    expect(PLACE_LAYER_KINDS).not.toContain('writing');
  });

  it('never stacks a portfolio face — every opener refuses the href', () => {
    const face = '/@alice.testnet';
    expect(isPortfolioFaceHref(face)).toBe(true);
    // A null parse is the refusal: each opener returns false on it, so the
    // face parks the sheet and navigates instead of layering.
    expect(parseInAppPostLayerHref(face)).toBeNull();
    expect(parseInAppPostQuotesHref(face)).toBeNull();
    expect(parseInAppDropLayerHref(face)).toBeNull();
  });

  it('refuses guest shelf and standing hrefs in every opener', () => {
    const hrefs = [
      '/@alice.testnet/standing/incoming',
      '/@alice.testnet/posts',
      '/home',
    ];
    for (const href of hrefs) {
      expect(parseInAppPostLayerHref(href)).toBeNull();
      expect(parseInAppPostQuotesHref(href)).toBeNull();
      expect(parseInAppDropLayerHref(href)).toBeNull();
    }
  });

  it('treats only a portfolio face as leaving the post drawer', () => {
    expect(isPortfolioFaceHref('/@alice.testnet')).toBe(true);
    expect(isPortfolioFaceHref('/@alice.testnet?from=home')).toBe(true);
    expect(isPortfolioFaceHref('/@alice.testnet/posts/1')).toBe(false);
    expect(isPortfolioFaceHref('/@alice.testnet/standing/incoming')).toBe(
      false
    );
    expect(isPortfolioFaceHref('/home')).toBe(false);
  });
});
