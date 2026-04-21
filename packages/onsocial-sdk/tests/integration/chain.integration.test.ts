// ---------------------------------------------------------------------------
// Integration: Chain — storage balance, allowances, and contract views
// ---------------------------------------------------------------------------

import { beforeAll, describe, expect, it } from 'vitest';
import type { OnSocial } from '../../src/client.js';
import { ACCOUNT_ID, CREDS_FILE, getClient, loadKeypair } from './helpers.js';

describe('chain', () => {
  let os: OnSocial;
  let publicKey: string;

  beforeAll(async () => {
    os = await getClient();
    ({ publicKey } = loadKeypair(CREDS_FILE));
  });

  it('should return the account storage balance', async () => {
    const balance = await os.chain.getStorageBalance(ACCOUNT_ID);

    expect(balance).toBeTruthy();
    expect(typeof balance?.balance).toBe('string');
    expect(typeof balance?.locked_balance).toBe('string');
    expect(typeof balance?.used_bytes).toBe('number');
    expect(typeof balance?.group_pool_used_bytes).toBe('number');
    expect(typeof balance?.platform_pool_used_bytes).toBe('number');
    expect(typeof balance?.platform_sponsored).toBe('boolean');
    expect(typeof balance?.platform_allowance).toBe('number');
    expect(Number(balance?.balance)).toBeGreaterThan(0);
    expect(Number(balance?.locked_balance)).toBeGreaterThanOrEqual(0);
    expect(balance?.used_bytes).toBeGreaterThanOrEqual(0);
    expect(balance?.platform_allowance).toBeGreaterThanOrEqual(0);
  });

  it('should return platform allowance details for the account', async () => {
    const allowance = await os.chain.getPlatformAllowance(ACCOUNT_ID);

    expect(typeof allowance.current_allowance).toBe('number');
    expect(allowance.current_allowance).toBeGreaterThanOrEqual(0);
    expect(typeof allowance.is_platform_sponsored).toBe('boolean');
    expect(typeof allowance.config.onboarding_bytes).toBe('number');
    expect(typeof allowance.config.daily_refill_bytes).toBe('number');
    expect(typeof allowance.config.max_allowance_bytes).toBe('number');
    expect(allowance.config.onboarding_bytes).toBeGreaterThan(0);
    expect(allowance.config.daily_refill_bytes).toBeGreaterThan(0);
    expect(allowance.config.max_allowance_bytes).toBeGreaterThan(0);
  });

  it('should return platform pool totals', async () => {
    const pool = await os.chain.getPlatformPool();

    expect(pool).toBeTruthy();
    expect(typeof pool?.storage_balance).toBe('string');
    expect(typeof pool?.total_bytes).toBe('number');
    expect(typeof pool?.used_bytes).toBe('number');
    expect(typeof pool?.shared_bytes).toBe('number');
    expect(typeof pool?.available_bytes).toBe('number');
    expect(Number(pool?.storage_balance)).toBeGreaterThan(0);
    expect(pool?.total_bytes).toBeGreaterThan(0);
    expect(pool?.used_bytes).toBeGreaterThanOrEqual(0);
    expect(pool?.available_bytes).toBeGreaterThanOrEqual(0);
    expect((pool?.used_bytes ?? 0) + (pool?.available_bytes ?? 0)).toBe(
      pool?.total_bytes
    );
  });

  it('should return a numeric nonce for the account public key', async () => {
    const nonce = await os.chain.getNonce(ACCOUNT_ID, publicKey);

    expect(nonce).toMatch(/^\d+$/);
    expect(Number(nonce)).toBeGreaterThan(0);
  });

  it('should return the contract status and version', async () => {
    const [status, version] = await Promise.all([
      os.chain.getContractStatus(),
      os.chain.getVersion(),
    ]);

    expect(['Genesis', 'Live', 'ReadOnly']).toContain(status);
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('should return governance config limits', async () => {
    const config = await os.chain.getConfig();

    expect(config.max_key_length).toBeGreaterThan(0);
    expect(config.max_path_depth).toBeGreaterThan(0);
    expect(config.max_batch_size).toBeGreaterThan(0);
    expect(config.max_value_bytes).toBeGreaterThan(0);
    expect(config.platform_onboarding_bytes).toBeGreaterThan(0);
    expect(config.platform_daily_refill_bytes).toBeGreaterThan(0);
    expect(config.platform_allowance_max_bytes).toBeGreaterThan(0);
    expect(Array.isArray(config.intents_executors)).toBe(true);
    expect(config.intents_executors.length).toBeGreaterThan(0);
  });

  it('should expose contract info consistent with status and config views', async () => {
    const [info, status, version, config] = await Promise.all([
      os.chain.getContractInfo(),
      os.chain.getContractStatus(),
      os.chain.getVersion(),
      os.chain.getConfig(),
    ]);

    expect(info.manager).toBeTruthy();
    expect(info.status).toBe(status);
    expect(info.version).toBe(version);
    expect(info.config).toEqual(config);
  });

  it('should return the configured WNEAR account', async () => {
    const wnear = await os.chain.getWnearAccount();

    expect(typeof wnear).toBe('string');
    expect(wnear).toMatch(/\.testnet$/);
  });
});
