import { describe, expect, it } from 'vitest';
import {
  ENDORSE_CONNECT_CTA,
  ENDORSE_CONNECT_HINT,
} from '@/lib/endorse-compose-voice';

describe('endorse compose Connect voice', () => {
  it('asks Connect, not Connect wallet', () => {
    expect(ENDORSE_CONNECT_CTA).toBe('Connect');
    expect(ENDORSE_CONNECT_CTA.toLowerCase()).not.toContain('wallet');
  });

  it('hints Connect to put your name behind them', () => {
    expect(ENDORSE_CONNECT_HINT).toBe(
      'Connect to put your name behind them.'
    );
    expect(ENDORSE_CONNECT_HINT.toLowerCase()).not.toContain('wallet');
  });
});
