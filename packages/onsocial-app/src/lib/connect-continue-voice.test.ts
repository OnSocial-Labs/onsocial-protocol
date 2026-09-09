import { describe, expect, it } from 'vitest';
import { CONNECT_CONTINUE, connectBefore } from '@/lib/connect-continue-voice';

describe('connect continue voice', () => {
  it('asks Connect, not Connect wallet', () => {
    expect(CONNECT_CONTINUE).toBe('Connect to continue.');
    expect(CONNECT_CONTINUE.toLowerCase()).not.toContain('wallet');
    expect(connectBefore('updating standing').toLowerCase()).not.toContain(
      'wallet'
    );
  });
});
