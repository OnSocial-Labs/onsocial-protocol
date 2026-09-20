import { describe, expect, it } from 'vitest';
import {
  appendThreadFocusReply,
  canonicalizePostLayerHref,
  isOverlayPostLayerLocation,
  parseInAppPostLayerHref,
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

  it('is false on a real post page or a non-post location', () => {
    expect(
      isOverlayPostLayerLocation(
        '/@alice.testnet/posts/123',
        '/@alice.testnet/posts/123?reply=9'
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
