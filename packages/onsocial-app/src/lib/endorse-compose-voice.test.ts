import { describe, expect, it } from 'vitest';
import {
  ENDORSE_CONNECTED_HINT,
  ENDORSE_CONNECT_CTA,
  ENDORSE_CONNECT_HINT,
  ENDORSE_SUBMIT_CTA,
} from '@/lib/endorse-compose-voice';

describe('endorse compose Connect voice', () => {
  it('asks Connect, not Connect wallet', () => {
    expect(ENDORSE_CONNECT_CTA).toBe('Connect');
    expect(ENDORSE_CONNECT_CTA.toLowerCase()).not.toContain('wallet');
  });

  it('hints Connect to put your name behind them', () => {
    expect(ENDORSE_CONNECT_HINT).toBe('Connect to put your name behind them.');
    expect(ENDORSE_CONNECT_HINT.toLowerCase()).not.toContain('wallet');
  });

  it('connected submit is Endorse, not Connect wallet', () => {
    expect(ENDORSE_SUBMIT_CTA).toBe('Endorse');
    expect(ENDORSE_SUBMIT_CTA.toLowerCase()).not.toContain('wallet');
    expect(ENDORSE_CONNECTED_HINT).toBe(
      'Public vouch — topic, note, and media are optional.'
    );
    expect(ENDORSE_CONNECTED_HINT.toLowerCase()).not.toContain('wallet');
  });
});
