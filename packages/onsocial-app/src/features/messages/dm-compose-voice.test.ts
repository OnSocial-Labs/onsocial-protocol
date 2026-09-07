import { describe, expect, it } from 'vitest';
import { DM_CONNECT_CTA, DM_CONNECT_HINT } from '@/features/messages/dm-compose-voice';

describe('DM compose Connect voice', () => {
  it('asks Connect, not Connect wallet', () => {
    expect(DM_CONNECT_CTA).toBe('Connect');
    expect(DM_CONNECT_CTA.toLowerCase()).not.toContain('wallet');
  });

  it('hints Connect to message them', () => {
    expect(DM_CONNECT_HINT).toBe('Connect to message them.');
    expect(DM_CONNECT_HINT.toLowerCase()).not.toContain('wallet');
  });
});
