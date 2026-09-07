import { describe, expect, it } from 'vitest';
import { COLLECTIBLES_CONNECT_HINT } from '@/features/collectibles/collectibles-vault-voice';

describe('COLLECTIBLES_CONNECT_HINT', () => {
  it('asks Connect, not Connect wallet', () => {
    expect(COLLECTIBLES_CONNECT_HINT).toBe('Connect to open Collectibles.');
    expect(COLLECTIBLES_CONNECT_HINT.toLowerCase()).not.toContain('wallet');
  });
});
