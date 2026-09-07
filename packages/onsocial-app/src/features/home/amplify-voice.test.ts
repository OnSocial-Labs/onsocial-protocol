import { describe, expect, it } from 'vitest';
import {
  AMPLIFY_CONNECT_CTA,
  AMPLIFY_CONNECT_HINT,
} from '@/features/home/amplify-voice';

describe('amplify Connect voice', () => {
  it('asks Connect, not Connect wallet', () => {
    expect(AMPLIFY_CONNECT_CTA).toBe('Connect');
    expect(AMPLIFY_CONNECT_CTA.toLowerCase()).not.toContain('wallet');
  });

  it('hints Connect to amplify with SOCIAL', () => {
    expect(AMPLIFY_CONNECT_HINT).toBe('Connect to amplify with SOCIAL.');
    expect(AMPLIFY_CONNECT_HINT.toLowerCase()).not.toContain('wallet');
  });
});
