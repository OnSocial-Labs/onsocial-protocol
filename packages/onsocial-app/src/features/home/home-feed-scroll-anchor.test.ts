import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureVisibleFeedAnchor,
  DM_ANCHOR_QUERY,
  NOTIFICATION_ANCHOR_QUERY,
  STANDING_ANCHOR_QUERY,
  restoreFeedAnchor,
  THREAD_ANCHOR_QUERY,
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

type FakeThreadRow = {
  top: number;
  height: number;
  key?: string;
};

function fakeThreadRow({ top, height, key }: FakeThreadRow) {
  return {
    getBoundingClientRect: () => ({ top, bottom: top + height }),
    dataset: key === undefined ? {} : { threadFocusKey: key },
  };
}

function fakeThreadRoot(
  rootTop: number,
  rows: ReturnType<typeof fakeThreadRow>[]
) {
  const root = {
    scrollTop: 0,
    getBoundingClientRect: () => ({ top: rootTop }),
    querySelectorAll: (selector: string) =>
      selector === '[data-thread-focus-key]' ? rows : [],
    querySelector: vi.fn((selector: string) => {
      const match = /\[data-thread-focus-key="([^"]+)"\]/.exec(selector);
      return rows.find((r) => r.dataset.threadFocusKey === match?.[1]) ?? null;
    }),
  };
  return root as unknown as HTMLElement & {
    scrollTop: number;
    querySelector: ReturnType<typeof vi.fn>;
  };
}

describe('custom anchor queries (thread rows)', () => {
  it('captures the first visible thread row by its focus key', () => {
    const root = fakeThreadRoot(100, [
      fakeThreadRow({ top: -300, height: 200, key: 'a.near:p1' }), // above
      fakeThreadRow({ top: -40, height: 200, key: 'a.near:p2' }),
    ]);
    expect(captureVisibleFeedAnchor(root, THREAD_ANCHOR_QUERY)).toEqual({
      key: 'a.near:p2',
      top: -140,
    });
  });

  it('skips rows without a key instead of anchoring on them', () => {
    const root = fakeThreadRoot(100, [
      fakeThreadRow({ top: -40, height: 200 }), // visible but keyless
      fakeThreadRow({ top: 160, height: 200, key: 'a.near:p3' }),
    ]);
    expect(captureVisibleFeedAnchor(root, THREAD_ANCHOR_QUERY)?.key).toBe(
      'a.near:p3'
    );
  });

  it('restores via the focus-key lookup selector', () => {
    const root = fakeThreadRoot(100, [
      fakeThreadRow({ top: 300, height: 200, key: 'a.near:p2' }),
    ]);
    restoreFeedAnchor(
      root,
      { key: 'a.near:p2', top: -140 },
      THREAD_ANCHOR_QUERY
    );
    expect(root.querySelector).toHaveBeenCalledWith(
      '[data-thread-focus-key="a.near:p2"]'
    );
    expect(root.scrollTop).toBe(340);
  });
});

type FakeNotificationRow = {
  top: number;
  height: number;
  key?: string;
};

function fakeNotificationRow({ top, height, key }: FakeNotificationRow) {
  return {
    getBoundingClientRect: () => ({ top, bottom: top + height }),
    dataset: key === undefined ? {} : { notificationKey: key },
  };
}

function fakeNotificationRoot(
  rootTop: number,
  rows: ReturnType<typeof fakeNotificationRow>[]
) {
  const root = {
    scrollTop: 0,
    getBoundingClientRect: () => ({ top: rootTop }),
    querySelectorAll: (selector: string) =>
      selector === '[data-notification-key]' ? rows : [],
    querySelector: vi.fn((selector: string) => {
      const match = /\[data-notification-key="([^"]+)"\]/.exec(selector);
      return rows.find((r) => r.dataset.notificationKey === match?.[1]) ?? null;
    }),
  };
  return root as unknown as HTMLElement & {
    scrollTop: number;
    querySelector: ReturnType<typeof vi.fn>;
  };
}

describe('custom anchor queries (notification rows)', () => {
  it('captures the first visible row by its notification key', () => {
    const root = fakeNotificationRoot(100, [
      fakeNotificationRow({ top: -300, height: 80, key: 'day:2026-08-25' }), // above
      fakeNotificationRow({ top: 40, height: 80, key: 'n-2' }), // bottom 120
    ]);
    expect(captureVisibleFeedAnchor(root, NOTIFICATION_ANCHOR_QUERY)).toEqual({
      key: 'n-2',
      top: -60,
    });
  });

  it('skips rows without a key instead of anchoring on them', () => {
    const root = fakeNotificationRoot(100, [
      fakeNotificationRow({ top: -40, height: 80 }), // visible but keyless
      fakeNotificationRow({ top: 160, height: 80, key: 'n-3' }),
    ]);
    expect(captureVisibleFeedAnchor(root, NOTIFICATION_ANCHOR_QUERY)?.key).toBe(
      'n-3'
    );
  });

  it('restores via the notification-key lookup selector', () => {
    const root = fakeNotificationRoot(100, [
      fakeNotificationRow({ top: 300, height: 80, key: 'n-2' }),
    ]);
    restoreFeedAnchor(
      root,
      { key: 'n-2', top: -140 },
      NOTIFICATION_ANCHOR_QUERY
    );
    expect(root.querySelector).toHaveBeenCalledWith(
      '[data-notification-key="n-2"]'
    );
    expect(root.scrollTop).toBe(340);
  });
});

type FakeDmRow = {
  top: number;
  height: number;
  key?: string;
};

function fakeDmRow({ top, height, key }: FakeDmRow) {
  return {
    getBoundingClientRect: () => ({ top, bottom: top + height }),
    dataset: key === undefined ? {} : { dmRowKey: key },
  };
}

function fakeDmRoot(rootTop: number, rows: ReturnType<typeof fakeDmRow>[]) {
  const root = {
    scrollTop: 0,
    getBoundingClientRect: () => ({ top: rootTop }),
    querySelectorAll: (selector: string) =>
      selector === '[data-dm-row-key]' ? rows : [],
    querySelector: vi.fn((selector: string) => {
      const match = /\[data-dm-row-key="([^"]+)"\]/.exec(selector);
      return rows.find((r) => r.dataset.dmRowKey === match?.[1]) ?? null;
    }),
  };
  return root as unknown as HTMLElement & {
    scrollTop: number;
    querySelector: ReturnType<typeof vi.fn>;
  };
}

describe('custom anchor queries (DM thread rows)', () => {
  it('captures the first visible bubble by its row key', () => {
    const root = fakeDmRoot(100, [
      fakeDmRow({ top: -300, height: 64, key: 'msg-1' }), // above
      fakeDmRow({ top: 40, height: 64, key: 'msg-2' }), // bottom 104
    ]);
    expect(captureVisibleFeedAnchor(root, DM_ANCHOR_QUERY)).toEqual({
      key: 'msg-2',
      top: -60,
    });
  });

  it('captures day rules alongside bubbles', () => {
    const root = fakeDmRoot(100, [
      fakeDmRow({ top: -40, height: 30 }), // visible but keyless
      fakeDmRow({ top: 120, height: 30, key: 'day:2026-08-25' }),
    ]);
    expect(captureVisibleFeedAnchor(root, DM_ANCHOR_QUERY)?.key).toBe(
      'day:2026-08-25'
    );
  });

  it('restores via the dm-row-key lookup selector', () => {
    const root = fakeDmRoot(100, [
      fakeDmRow({ top: 300, height: 64, key: 'msg-2' }),
    ]);
    restoreFeedAnchor(root, { key: 'msg-2', top: -140 }, DM_ANCHOR_QUERY);
    expect(root.querySelector).toHaveBeenCalledWith(
      '[data-dm-row-key="msg-2"]'
    );
    expect(root.scrollTop).toBe(340);
  });
});

type FakeStandingRow = {
  top: number;
  height: number;
  key?: string;
};

function fakeStandingRow({ top, height, key }: FakeStandingRow) {
  return {
    getBoundingClientRect: () => ({ top, bottom: top + height }),
    dataset: key === undefined ? {} : { standingKey: key },
  };
}

function fakeStandingRoot(
  rootTop: number,
  rows: ReturnType<typeof fakeStandingRow>[]
) {
  const root = {
    scrollTop: 0,
    getBoundingClientRect: () => ({ top: rootTop }),
    querySelectorAll: (selector: string) =>
      selector === '[data-standing-key]' ? rows : [],
    querySelector: vi.fn((selector: string) => {
      const match = /\[data-standing-key="([^"]+)"\]/.exec(selector);
      return rows.find((r) => r.dataset.standingKey === match?.[1]) ?? null;
    }),
  };
  return root as unknown as HTMLElement & {
    scrollTop: number;
    querySelector: ReturnType<typeof vi.fn>;
  };
}

describe('custom anchor queries (standing rows)', () => {
  it('captures the first visible standing row by its account key', () => {
    const root = fakeStandingRoot(100, [
      fakeStandingRow({ top: -300, height: 76, key: 'a.testnet' }), // above
      fakeStandingRow({ top: 40, height: 76, key: 'b.testnet' }), // bottom 116
    ]);
    expect(captureVisibleFeedAnchor(root, STANDING_ANCHOR_QUERY)).toEqual({
      key: 'b.testnet',
      top: -60,
    });
  });

  it('skips rows without a key instead of anchoring on them', () => {
    const root = fakeStandingRoot(100, [
      fakeStandingRow({ top: -40, height: 76 }), // visible but keyless
      fakeStandingRow({ top: 160, height: 76, key: 'c.testnet' }),
    ]);
    expect(captureVisibleFeedAnchor(root, STANDING_ANCHOR_QUERY)?.key).toBe(
      'c.testnet'
    );
  });

  it('restores via the standing-key lookup selector', () => {
    const root = fakeStandingRoot(100, [
      fakeStandingRow({ top: 300, height: 76, key: 'b.testnet' }),
    ]);
    restoreFeedAnchor(
      root,
      { key: 'b.testnet', top: -140 },
      STANDING_ANCHOR_QUERY
    );
    expect(root.querySelector).toHaveBeenCalledWith(
      '[data-standing-key="b.testnet"]'
    );
    expect(root.scrollTop).toBe(340);
  });
});
