import { describe, expect, it } from 'vitest';
import {
  SWAP_CONNECT_CTA,
  SWAP_CONNECT_HINT,
} from '@/components/wallet/app-social-swap-voice';

describe('Get SOCIAL Connect voice', () => {
  it('asks Connect, not Connect wallet', () => {
    expect(SWAP_CONNECT_CTA).toBe('Connect');
    expect(SWAP_CONNECT_CTA.toLowerCase()).not.toContain('wallet');
  });

  it('hints Connect to get SOCIAL', () => {
    expect(SWAP_CONNECT_HINT).toBe('Connect to get SOCIAL.');
    expect(SWAP_CONNECT_HINT.toLowerCase()).not.toContain('wallet');
  });
});
