import { describe, expect, it } from 'vitest';
import { blockConfirmCopy, muteConfirmCopy } from '@/lib/block-confirm-copy';

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

  it('falls back to the spoken local part', () => {
    expect(blockConfirmCopy({ accountId: 'bob.testnet' }).title).toBe(
      'Block Bob?'
    );
  });
});

describe('muteConfirmCopy', () => {
  it('prefers display name in the title', () => {
    const copy = muteConfirmCopy({
      accountId: 'bob.testnet',
      profileName: 'Bob',
    });
    expect(copy.title).toBe('Mute Bob?');
    expect(copy.confirmLabel).toBe('Mute');
    expect(copy.body).toContain('Bob');
    expect(copy.body).toContain('unmute anytime');
  });

  it('falls back to the spoken local part', () => {
    expect(muteConfirmCopy({ accountId: 'bob.testnet' }).title).toBe(
      'Mute Bob?'
    );
  });
});
