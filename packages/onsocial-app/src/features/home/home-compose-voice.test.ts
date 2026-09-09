import { describe, expect, it } from 'vitest';
import { HOME_COMPOSE_CONNECT_LEAD } from '@/features/home/home-compose-voice';

describe('home compose Connect voice', () => {
  it('asks Connect, not Connect wallet', () => {
    expect(HOME_COMPOSE_CONNECT_LEAD).toBe('Connect to post.');
    expect(HOME_COMPOSE_CONNECT_LEAD.toLowerCase()).not.toContain('wallet');
  });
});
