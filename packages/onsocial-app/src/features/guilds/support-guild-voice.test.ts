import { describe, expect, it } from 'vitest';
import {
  SUPPORT_CONNECT_HINT,
  SUPPORT_GUILD_CONNECT_CTA,
} from '@/features/guilds/support-guild-voice';

describe('support / guild Connect voice', () => {
  it('asks Connect, not Connect wallet', () => {
    expect(SUPPORT_GUILD_CONNECT_CTA).toBe('Connect');
    expect(SUPPORT_GUILD_CONNECT_CTA.toLowerCase()).not.toContain('wallet');
  });

  it('hints Connect to send SOCIAL', () => {
    expect(SUPPORT_CONNECT_HINT).toBe('Connect to send SOCIAL.');
    expect(SUPPORT_CONNECT_HINT.toLowerCase()).not.toContain('wallet');
  });
});
