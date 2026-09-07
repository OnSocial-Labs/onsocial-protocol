import { describe, expect, it } from 'vitest';
import { DOCK_CONNECT_CTA } from '@/components/wallet/dock-connect-voice';

describe('dock Connect voice', () => {
  it('asks Connect, not Connect wallet', () => {
    expect(DOCK_CONNECT_CTA).toBe('Connect');
    expect(DOCK_CONNECT_CTA.toLowerCase()).not.toContain('wallet');
  });
});
