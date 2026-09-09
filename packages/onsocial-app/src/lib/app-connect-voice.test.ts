import { describe, expect, it } from 'vitest';
import { CONNECT_CONTINUE_ERROR } from '@/lib/app-connect-voice';

describe('Connect continue voice', () => {
  it('asks Connect to continue, not Connect wallet', () => {
    expect(CONNECT_CONTINUE_ERROR).toBe('Connect to continue.');
    expect(CONNECT_CONTINUE_ERROR.toLowerCase()).not.toContain('wallet');
  });
});
