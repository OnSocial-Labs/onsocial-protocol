// ---------------------------------------------------------------------------
// Integration: Scarces — mint, list, delist
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll } from 'vitest';
import { getClient, ACCOUNT_ID } from './helpers.js';
import type { OnSocial } from '../../src/client.js';

describe('scarces', () => {
  let os: OnSocial;
  let tokenTxHash: string;

  beforeAll(async () => {
    os = await getClient();
  });

  it('should mint a scarce (text-only)', async () => {
    const result = await os.scarces.mint({
      title: `Integration Test Scarce ${Date.now()}`,
      description: 'Automated integration test — safe to ignore',
    });
    tokenTxHash = result.txHash!;
    expect(tokenTxHash).toBeTruthy();
  });

  it('should mint a scarce with royalty', async () => {
    const result = await os.scarces.mint({
      title: `Royalty Scarce ${Date.now()}`,
      description: 'Test royalty mint',
      royalty: { [ACCOUNT_ID]: 1000 }, // 10%
    });
    expect(result.txHash).toBeTruthy();
  });
});
