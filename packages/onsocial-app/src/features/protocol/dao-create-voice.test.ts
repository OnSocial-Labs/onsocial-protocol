import { describe, expect, it } from 'vitest';
import {
  DAO_CREATE_CONNECT_CTA,
  DAO_CREATE_CONNECT_HINT,
} from '@/features/protocol/dao-create-voice';

describe('DAO create Connect voice', () => {
  it('asks Connect, not Connect wallet', () => {
    expect(DAO_CREATE_CONNECT_CTA).toBe('Connect');
    expect(DAO_CREATE_CONNECT_CTA.toLowerCase()).not.toContain('wallet');
  });

  it('hints Connect to create a DAO', () => {
    expect(DAO_CREATE_CONNECT_HINT).toBe('Connect to create a DAO.');
    expect(DAO_CREATE_CONNECT_HINT.toLowerCase()).not.toContain('wallet');
  });
});
