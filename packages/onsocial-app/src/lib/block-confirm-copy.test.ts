import { describe, expect, it } from 'vitest';
import { blockConfirmCopy } from '@/lib/block-confirm-copy';

describe('blockConfirmCopy', () => {
  it('prefers display name in the title', () => {
    const copy = blockConfirmCopy({
      accountId: 'bob.testnet',
      profileName: 'Bob',
    });
    expect(copy.title).toBe('Block Bob?');
    expect(copy.confirmLabel).toBe('Block');
    expect(copy.body).toContain('Bob');
  });

  it('falls back to account id', () => {
    expect(
      blockConfirmCopy({ accountId: 'bob.testnet' }).title
    ).toBe('Block bob.testnet?');
  });
});
