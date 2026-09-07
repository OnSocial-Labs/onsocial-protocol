import { describe, expect, it } from 'vitest';
import {
  CUSTOMIZE_CONNECT_CTA,
  CUSTOMIZE_CONNECT_HINT,
} from '@/components/portfolio/customize-connect-voice';

describe('customize Connect voice', () => {
  it('asks Connect, not Connect wallet', () => {
    expect(CUSTOMIZE_CONNECT_CTA).toBe('Connect');
    expect(CUSTOMIZE_CONNECT_CTA.toLowerCase()).not.toContain('wallet');
  });

  it('hints Connect to customize this page', () => {
    expect(CUSTOMIZE_CONNECT_HINT).toBe('Connect to customize this page.');
    expect(CUSTOMIZE_CONNECT_HINT.toLowerCase()).not.toContain('wallet');
  });
});
