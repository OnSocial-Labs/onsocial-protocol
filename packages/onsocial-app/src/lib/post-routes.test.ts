import { describe, expect, it } from 'vitest';
import {
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
});
