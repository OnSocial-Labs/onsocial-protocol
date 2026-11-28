import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseInAppDropLayerHref } from '@/lib/app-routes';
import {
  parseInAppPostLayerHref,
  parseInAppPostQuotesHref,
  type PostQuotesTab,
} from '@/lib/post-routes';
import {
  isPortfolioFaceHref,
  readBootPlace,
  readCloseOwnsPop,
} from './post-thread-layer';
import {
  appendTrailEntry,
  replyOpenedOverMediaFace,
  isReaderLayerKind,
  isSameReaderTarget,
  revealTrailReader,
  PLACE_LAYER_KINDS,
  dropTapRevealsOpenDrop,
  replaceStackWith,
  retabTopQuotes,
  walkBackOneStep,
  type DropStackEntry,
  type PostStackEntry,
  type QuotesStackEntry,
  type ReadStackEntry,
} from './post-thread-stack';

const layerSrc = dirname(fileURLToPath(import.meta.url));

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

function readEntry(collectionId: string): ReadStackEntry {
  seq += 1;
  return { id: `read-${seq}`, kind: 'read', collectionId, zIndex: 120 };
}

describe('thread trail stack', () => {
  it('parks only the previous top when a reply opens over the thread', () => {
    const root = postEntry('alice.testnet', '1');
    const reply = postEntry('bob.testnet', '9');

    const trail = appendTrailEntry([root], reply);

    expect(trail).toHaveLength(2);
    // Stable identities — React keys keep the parked parent + new top.
    expect(trail[0]).toBe(root);
    expect(trail[1]).toBe(reply);
    const quotes = quotesEntry('alice.testnet', '1');
    const deeper = appendTrailEntry(trail, quotes);
    // Deeper sheets unmount — only the previous top stays parked.
    expect(deeper).toHaveLength(2);
    expect(deeper[0]).toBe(reply);
    expect(deeper[1]).toBe(quotes);
  });

  it('lifts a reply opened from a media face above that face', () => {
    expect(
      replyOpenedOverMediaFace({ trailZ: 90, mediaFaceZ: null, lift: 80 })
    ).toEqual({ zIndex: 90, openedAboveMediaFace: false });
    // Face painted at 170. Pre-lift floor 91 renders at 171, in front of it.
    expect(
      replyOpenedOverMediaFace({ trailZ: 90, mediaFaceZ: 170, lift: 80 })
    ).toEqual({ zIndex: 91, openedAboveMediaFace: true });
    // A cover opened above that reply paints higher. The next reply still clears it.
    expect(
      replyOpenedOverMediaFace({ trailZ: 90, mediaFaceZ: 173, lift: 80 })
    ).toEqual({ zIndex: 94, openedAboveMediaFace: true });
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
    const drop = dropEntry('chapter-one');
    const read = readEntry('chapter-one');
    expect(walkBackOneStep([drop, read])).toEqual([drop]);
    expect(walkBackOneStep([read])).toBeNull();
  });

  it('a drop takes over the host instead of stacking over readers', () => {
    expect(isReaderLayerKind('post')).toBe(true);
    expect(isReaderLayerKind('quotes')).toBe(true);
    expect(isReaderLayerKind('read')).toBe(true);
    expect(isReaderLayerKind('drop')).toBe(false);

    const drop = dropEntry('writers-chest');
    expect(replaceStackWith(drop)).toEqual([drop]);
  });

  it('returns to a post already on the trail instead of stacking another copy', () => {
    const audio = postEntry('alice.testnet', 'audio');
    const reply = postEntry('bob.testnet', 'reply');
    const nested = postEntry('cara.testnet', 'nested');
    const trail = [audio, reply, nested];

    expect(
      revealTrailReader(trail, {
        kind: 'post',
        accountId: 'alice.testnet',
        postId: 'audio',
        groupId: null,
      })
    ).toEqual({ stack: [audio], at: 'back' });
    expect(
      revealTrailReader(trail, {
        kind: 'post',
        accountId: 'bob.testnet',
        postId: 'reply',
        groupId: null,
      })
    ).toEqual({ stack: [audio, reply], at: 'back' });
    expect(
      revealTrailReader(trail, {
        kind: 'post',
        accountId: 'cara.testnet',
        postId: 'nested',
        groupId: null,
      })?.at
    ).toBe('top');
    expect(
      revealTrailReader(trail, {
        kind: 'post',
        accountId: 'dana.testnet',
        postId: 'new',
        groupId: null,
      })
    ).toBeNull();
    // Quotes is a different surface over the same post — not a return.
    expect(
      revealTrailReader([audio, quotesEntry('alice.testnet', 'audio')], {
        kind: 'post',
        accountId: 'alice.testnet',
        postId: 'audio',
        groupId: null,
      })
    ).toEqual({ stack: [audio], at: 'back' });
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
  it('stacks post readers, quotes, drops, and Read', () => {
    expect([...PLACE_LAYER_KINDS].sort()).toEqual([
      'drop',
      'post',
      'quotes',
      'read',
    ]);
  });

  it('Drop from a reader that covers that drop closes the reader', () => {
    const drop = dropEntry('chapter-one');
    const read = readEntry('chapter-one');
    expect(dropTapRevealsOpenDrop([drop, read], 'chapter-one')).toBe(true);
    expect(dropTapRevealsOpenDrop([read], 'chapter-one')).toBe(true);
    expect(
      dropTapRevealsOpenDrop([readEntry('chapter-one')], 'chapter-one%20')
    ).toBe(true);
    expect(dropTapRevealsOpenDrop([drop, read], 'other-drop')).toBe(false);
    expect(dropTapRevealsOpenDrop([drop], 'chapter-one')).toBe(false);
    expect(
      dropTapRevealsOpenDrop(
        [dropEntry('other-drop'), readEntry('chapter-one')],
        'chapter-one'
      )
    ).toBe(false);
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

describe('read boot and owned close', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('owns the pop when header or Esc closes a read over a drop', () => {
    expect(
      readCloseOwnsPop({
        stackLength: 2,
        topKind: 'read',
        exitFromPop: false,
        depth: 2,
        historyHasLayer: true,
      })
    ).toBe(true);
    expect(
      readCloseOwnsPop({
        stackLength: 2,
        topKind: 'read',
        exitFromPop: true,
        depth: 2,
        historyHasLayer: true,
      })
    ).toBe(false);
    expect(
      readCloseOwnsPop({
        stackLength: 1,
        topKind: 'read',
        exitFromPop: false,
        depth: 1,
        historyHasLayer: true,
      })
    ).toBe(false);
  });

  it('restores a feed read from the history stamp', () => {
    vi.stubGlobal('window', {
      location: { pathname: '/home', search: '' },
      history: {
        state: {
          __NA: true,
          onsocialPostLayer: true,
          onsocialPostLayerDepth: 1,
          onsocialReadLayer: { accountId: 'alice.near', postId: 'night' },
        },
        back: vi.fn(),
        pushState: vi.fn(),
        replaceState: vi.fn(),
        length: 2,
      },
      addEventListener: vi.fn(),
    });
    const boot = readBootPlace();
    expect(boot.underlay).toBe('/home');
    expect(boot.stack).toHaveLength(1);
    expect(boot.stack[0]).toMatchObject({
      kind: 'read',
      feedPost: { accountId: 'alice.near', postId: 'night' },
      readables: [],
    });
  });
});

describe('seeded thread open chunks', () => {
  it('does not put a full-page skeleton in dynamic loading', () => {
    const source = readFileSync(
      join(layerSrc, 'post-thread-layer.tsx'),
      'utf8'
    );
    expect(source).not.toContain('loading: () => <PostThreadPageSkeleton');
    expect(source).not.toContain('loading: () => <PostQuotesPageSkeleton');
    expect(source).toContain('<Suspense fallback={null}>');
    expect(source).toContain('warmFeedOpenChunks');
    expect(source).not.toContain('warmFeedOpenChunksIdle');
    expect(source).toContain('ensurePostPanelChunk');
    expect(source).toContain('warmDropPanel');
  });
});
