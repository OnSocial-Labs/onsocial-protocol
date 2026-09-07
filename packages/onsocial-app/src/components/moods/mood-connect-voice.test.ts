import { describe, expect, it } from 'vitest';
import {
  MOOD_CONNECT_CTA,
  moodConnectHint,
} from '@/components/moods/mood-connect-voice';

describe('mood Connect voice', () => {
  it('asks Connect, not Connect wallet', () => {
    expect(MOOD_CONNECT_CTA).toBe('Connect');
    expect(MOOD_CONNECT_CTA.toLowerCase()).not.toContain('wallet');
  });

  it('hints Connect to apply a mood', () => {
    expect(moodConnectHint({ isDao: false })).toBe('Connect to apply a mood.');
    expect(moodConnectHint({ isDao: true })).toBe(
      'Connect to set this DAO mood.'
    );
    expect(moodConnectHint({ isDao: false }).toLowerCase()).not.toContain(
      'wallet'
    );
    expect(moodConnectHint({ isDao: true }).toLowerCase()).not.toContain(
      'wallet'
    );
  });
});
