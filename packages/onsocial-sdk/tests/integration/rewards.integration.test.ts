// ---------------------------------------------------------------------------
// Integration: Rewards — partner-key-backed reward reads and claims
// ---------------------------------------------------------------------------

import { beforeAll, describe, expect, it } from 'vitest';
import type { OnSocial } from '../../src/client.js';
import { ACCOUNT_ID, getPartnerClient } from './helpers.js';

const hasPartnerKey = !!process.env.ONSOCIAL_PARTNER_API_KEY;
const describeRewards = hasPartnerKey ? describe : describe.skip;

describeRewards('rewards', () => {
  let os: OnSocial;

  beforeAll(() => {
    os = getPartnerClient();
  });

  it('should return reward balance state for the account', async () => {
    const balance = await os.rewards.getBalance(ACCOUNT_ID);

    expect(typeof balance.claimable).toBe('string');
    expect(balance.claimable).toMatch(/^\d+$/);
    expect(balance.success).toBe(true);
    expect(typeof balance.account_id).toBe('string');
    expect(typeof balance.app_id).toBe('string');
  });

  it('should return the partner app config', async () => {
    const app = await os.rewards.getAppConfig();

    expect(app.success).toBe(true);
    expect(typeof app.app_id).toBe('string');
    expect(app.config).toBeTruthy();
    expect(typeof app.config).toBe('object');
  });

  it('should return a zero-claim success response when nothing is claimable', async () => {
    const claim = await os.rewards.claim(ACCOUNT_ID);

    expect(claim.success).toBe(true);
    expect(typeof claim.claimed).toBe('string');
    expect(claim.claimed).toMatch(/^\d+$/);
    expect(typeof claim.account_id).toBe('string');
  });
});