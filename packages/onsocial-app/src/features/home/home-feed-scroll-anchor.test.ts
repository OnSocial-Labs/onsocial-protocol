import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureVisibleFeedAnchor,
  restoreFeedAnchor,
} from './home-feed-scroll-anchor';

type FakeBlock = {
  top: number;
  height: number;
  key: string;
};

function fakeBlock({ top, height, key }: FakeBlock) {
  return {
    getBoundingClientRect: () => ({ top, bottom: top + height }),
    dataset: { feedKey: key },
  };
}

function fakeRoot(rootTop: number, blocks: ReturnType<typeof fakeBlock>[]) {
  const root = {
    scrollTop: 0,
    getBoundingClientRect: () => ({ top: rootTop }),
    querySelectorAll: (selector: string) =>
      selector === '.home-feed-block[data-feed-key]' ? blocks : [],
    querySelector: vi.fn((selector: string) => {
      const match = /\[data-feed-key="([^"]+)"\]/.exec(selector);
      return blocks.find((b) => b.dataset.feedKey === match?.[1]) ?? null;
    }),
  };
  return root as unknown as HTMLElement & {
    scrollTop: number;
    querySelector: ReturnType<typeof vi.fn>;
  };
}

beforeEach(() => {
  // Node has no CSS global; keys in these tests need no escaping.
  vi.stubGlobal('CSS', { escape: (value: string) => value });
});

describe('captureVisibleFeedAnchor', () => {
  it('returns null without a root or when every block is above the fold', () => {
    expect(captureVisibleFeedAnchor(null)).toBeNull();
    const root = fakeRoot(100, [
      fakeBlock({ top: 0, height: 40, key: 'a/1' }),
      fakeBlock({ top: 40, height: 50, key: 'a/2' }),
    ]);
    expect(captureVisibleFeedAnchor(root)).toBeNull();
  });

  it('anchors the first block still visible under the chrome', () => {
    const root = fakeRoot(100, [
      fakeBlock({ top: -300, height: 200, key: 'a/1' }), // fully above
      fakeBlock({ top: -40, height: 200, key: 'a/2' }), // partially visible
      fakeBlock({ top: 160, height: 200, key: 'a/3' }),
    ]);
    expect(captureVisibleFeedAnchor(root)).toEqual({ key: 'a/2', top: -140 });
  });

  it('skips blocks whose bottom edge sits exactly at the root top', () => {
    const root = fakeRoot(100, [
      fakeBlock({ top: -60, height: 159, key: 'a/1' }), // bottom = 99 < 101
      fakeBlock({ top: 99, height: 10, key: 'a/2' }),
    ]);
    expect(captureVisibleFeedAnchor(root)?.key).toBe('a/2');
  });
});

describe('restoreFeedAnchor', () => {
  it('scrolls by the distance the anchored row moved', () => {
    const root = fakeRoot(100, [
      fakeBlock({ top: 300, height: 200, key: 'a/2' }),
    ]);
    // Captured at viewport offset -140; now at 200 → row moved down 340.
    restoreFeedAnchor(root, { key: 'a/2', top: -140 });
    expect(root.scrollTop).toBe(340);
  });

  it('ignores sub-pixel drift and missing rows', () => {
    const steady = fakeRoot(100, [
      fakeBlock({ top: -39.5, height: 200, key: 'a/2' }),
    ]);
    restoreFeedAnchor(steady, { key: 'a/2', top: -140 });
    expect(steady.scrollTop).toBe(0);

    const gone = fakeRoot(100, [fakeBlock({ top: 0, height: 10, key: 'a/9' })]);
    restoreFeedAnchor(gone, { key: 'a/2', top: -140 });
    expect(gone.scrollTop).toBe(0);
  });

  it('looks the row up by its feed key', () => {
    const root = fakeRoot(100, [
      fakeBlock({ top: 60, height: 200, key: 'a/2' }),
    ]);
    restoreFeedAnchor(root, { key: 'a/2', top: -140 });
    expect(root.querySelector).toHaveBeenCalledWith(
      '.home-feed-block[data-feed-key="a/2"]'
    );
  });
});
