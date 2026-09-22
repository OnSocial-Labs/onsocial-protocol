import { describe, expect, it } from 'vitest';
import { previewWritingCoverSvg } from './portfolio-writing-cover';

const cover = {
  title: 'A note',
  postId: 'post-1',
  issuedAt: 1_700_000_000_000,
};

describe('previewWritingCoverSvg', () => {
  it('uses the spoken account name when no profile name is set', () => {
    const svg = previewWritingCoverSvg({
      ...cover,
      accountId: 'alice.near',
    });
    expect(svg).toContain('Alice');
    expect(svg).toContain('alice.near');
  });

  it('keeps a custom profile name above the account id', () => {
    const svg = previewWritingCoverSvg({
      ...cover,
      accountId: 'alice.near',
      displayName: 'Alice Builder',
    });
    expect(svg).toContain('Alice Builder');
    expect(svg).toContain('alice.near');
  });
});
