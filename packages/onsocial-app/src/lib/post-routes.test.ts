import { describe, expect, it } from 'vitest';
import {
  appendThreadFocusReply,
  canonicalizeGuildPostLayerHref,
  canonicalizePostLayerHref,
  isAppPostSheetHref,
  isInAppPostLayerHref,
  isOverlayPostLayerLocation,
  parseGuildPostLayerHref,
  parseGuildPostQuotesHref,
  parseInAppPostLayerHref,
  parseInAppPostQuotesHref,
  personalPostContentPath,
  personalPostPath,
  postThreadPath,
} from './post-routes';

describe('personalPostPath', () => {
  it('builds portfolio post thread URLs', () => {
    expect(personalPostPath('alice.testnet', '123')).toBe(
      '/@alice.testnet/posts/123'
    );
  });

  it('encodes post ids', () => {
    expect(personalPostPath('alice.testnet', 'a/b')).toBe(
      '/@alice.testnet/posts/a%2Fb'
    );
  });
});

describe('personalPostContentPath', () => {
  it('builds indexed personal paths', () => {
    expect(personalPostContentPath('alice.testnet', '123')).toBe(
      'alice.testnet/post/123'
    );
  });
});

describe('parseInAppPostLayerHref', () => {
  it('parses personal post permalinks', () => {
    expect(parseInAppPostLayerHref('/@alice.testnet/posts/123')).toEqual({
      accountId: 'alice.testnet',
      postId: '123',
    });
  });

  it('parses writing article permalinks as the same post', () => {
    expect(parseInAppPostLayerHref('/@alice.testnet/writing/123')).toEqual({
      accountId: 'alice.testnet',
      postId: '123',
    });
  });

  it('decodes encoded post ids', () => {
    expect(parseInAppPostLayerHref('/@alice.testnet/posts/a%2Fb')).toEqual({
      accountId: 'alice.testnet',
      postId: 'a/b',
    });
  });

  it('ignores guild threads and quotes screens', () => {
    expect(
      parseInAppPostLayerHref('/groups/dao/posts/alice.testnet/123')
    ).toBeNull();
    expect(
      parseInAppPostLayerHref('/@alice.testnet/posts/123/quotes')
    ).toBeNull();
  });
});

describe('parseInAppPostQuotesHref', () => {
  it('parses a personal quotes permalink', () => {
    expect(
      parseInAppPostQuotesHref('/@alice.testnet/posts/123/quotes')
    ).toEqual({
      accountId: 'alice.testnet',
      postId: '123',
    });
  });

  it('ignores the post itself and guild quote pages', () => {
    expect(parseInAppPostQuotesHref('/@alice.testnet/posts/123')).toBeNull();
    expect(
      parseInAppPostQuotesHref('/groups/dao/posts/alice.testnet/123/quotes')
    ).toBeNull();
  });
});

describe('isInAppPostLayerHref', () => {
  it('is true for personal post and writing permalinks', () => {
    expect(isInAppPostLayerHref('/@alice.testnet/posts/123')).toBe(true);
    expect(isInAppPostLayerHref('/@alice.testnet/writing/123')).toBe(true);
  });

  it('is false for guild threads so route matching stays personal', () => {
    expect(isInAppPostLayerHref('/groups/dao/posts/alice.testnet/123')).toBe(
      false
    );
  });
});

describe('parseGuildPostLayerHref', () => {
  it('parses a guild thread permalink', () => {
    expect(
      parseGuildPostLayerHref('/groups/dao/posts/alice.testnet/123')
    ).toEqual({
      groupId: 'dao',
      accountId: 'alice.testnet',
      postId: '123',
    });
  });

  it('ignores guild quote pages', () => {
    expect(
      parseGuildPostLayerHref('/groups/dao/posts/alice.testnet/123/quotes')
    ).toBeNull();
  });
});

describe('parseGuildPostQuotesHref', () => {
  it('parses a guild quotes permalink', () => {
    expect(
      parseGuildPostQuotesHref(
        '/groups/dao/posts/alice.testnet/123/quotes?tab=reposts'
      )
    ).toEqual({
      groupId: 'dao',
      accountId: 'alice.testnet',
      postId: '123',
    });
  });

  it('ignores the guild post itself', () => {
    expect(
      parseGuildPostQuotesHref('/groups/dao/posts/alice.testnet/123')
    ).toBeNull();
  });
});

describe('isAppPostSheetHref', () => {
  it('opens personal and guild threads over the current screen', () => {
    expect(isAppPostSheetHref('/@alice.testnet/posts/123')).toBe(true);
    expect(isAppPostSheetHref('/groups/dao/posts/alice.testnet/123')).toBe(
      true
    );
    expect(
      isAppPostSheetHref('/groups/dao/posts/alice.testnet/123/quotes')
    ).toBe(false);
  });
});

describe('canonicalizeGuildPostLayerHref', () => {
  it('keeps the reply query on the guild permalink', () => {
    expect(
      canonicalizeGuildPostLayerHref(
        '/groups/dao/posts/alice.testnet/123?reply=9'
      )
    ).toBe('/groups/dao/posts/alice.testnet/123?reply=9');
  });
});

describe('canonicalizePostLayerHref', () => {
  it('rewrites writing hrefs to the share permalink', () => {
    expect(
      canonicalizePostLayerHref('/@alice.testnet/writing/123?reply=9')
    ).toBe('/@alice.testnet/posts/123?reply=9');
  });
});

describe('isOverlayPostLayerLocation', () => {
  it('is true when the browser is on a post permalink over Discover or Home', () => {
    expect(
      isOverlayPostLayerLocation(
        '/discover',
        '/@alice.testnet/posts/123?reply=9'
      )
    ).toBe(true);
    expect(
      isOverlayPostLayerLocation('/home', '/@alice.testnet/posts/123')
    ).toBe(true);
  });

  it('is true when a guild thread is open over Home or the guild feed', () => {
    expect(
      isOverlayPostLayerLocation('/home', '/groups/dao/posts/alice.testnet/123')
    ).toBe(true);
    expect(
      isOverlayPostLayerLocation(
        '/groups/dao',
        '/groups/dao/posts/alice.testnet/123'
      )
    ).toBe(true);
    expect(
      isOverlayPostLayerLocation(
        '/groups/dao',
        '/groups/dao/posts/alice.testnet/123/quotes?tab=reposts'
      )
    ).toBe(true);
    expect(
      isOverlayPostLayerLocation(
        '/home',
        '/@alice.testnet/posts/123/quotes?tab=reposts'
      )
    ).toBe(true);
  });

  it('is false on a real post page or a non-post location', () => {
    expect(
      isOverlayPostLayerLocation(
        '/@alice.testnet/posts/123',
        '/@alice.testnet/posts/123?reply=9'
      )
    ).toBe(false);
    expect(
      isOverlayPostLayerLocation(
        '/groups/dao/posts/alice.testnet/123',
        '/groups/dao/posts/alice.testnet/123'
      )
    ).toBe(false);
    expect(isOverlayPostLayerLocation('/discover', '/discover')).toBe(false);
  });
});

describe('postThreadPath', () => {
  it('routes personal posts to portfolio threads', () => {
    expect(
      postThreadPath({
        accountId: 'alice.testnet',
        postId: '123',
      })
    ).toBe('/@alice.testnet/posts/123');
  });

  it('routes guild posts to guild threads', () => {
    expect(
      postThreadPath({
        accountId: 'alice.testnet',
        postId: '123',
        groupId: 'dao',
      })
    ).toBe('/groups/dao/posts/alice.testnet/123');
  });

  it('routes guild posts with nested group ids', () => {
    expect(
      postThreadPath({
        accountId: 'test05.onsocial.testnet',
        postId: '1783799687804',
        groupId: 'grp_md_perm_1779813274071_ojf237',
      })
    ).toBe(
      '/groups/grp_md_perm_1779813274071_ojf237/posts/test05.onsocial.testnet/1783799687804'
    );
  });
});

describe('appendThreadFocusReply', () => {
  it('appends reply focus query', () => {
    expect(appendThreadFocusReply('/@alice.testnet/posts/1', '999')).toBe(
      '/@alice.testnet/posts/1?reply=999'
    );
    expect(
      appendThreadFocusReply('/@alice.testnet/posts/1?media=unmute', '999')
    ).toBe('/@alice.testnet/posts/1?media=unmute&reply=999');
  });
});
