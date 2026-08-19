import { describe, expect, it } from 'vitest';
import { communityMonogram } from '@/components/community-cards/community-monogram';

describe('communityMonogram', () => {
  it('uses two letters from a single word', () => {
    expect(communityMonogram('Probe')).toBe('PR');
  });

  it('uses initials from multi-word names', () => {
    expect(communityMonogram('Midnight Records')).toBe('MR');
  });

  it('skips @ for account-like titles', () => {
    expect(communityMonogram('@treasury.onsocial.testnet')).toBe('TR');
  });

  it('falls back to ?? when empty', () => {
    expect(communityMonogram('   ')).toBe('??');
  });
});
