/**
 * Tests for /data routes — read-only RPC view calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — hoisted before imports
// ---------------------------------------------------------------------------

const mockRpcQuery = vi.fn();
vi.mock('../../src/rpc/index.js', () => ({
  rpcQuery: (...args: unknown[]) => mockRpcQuery(...args),
}));

vi.mock('../../src/config/index.js', () => ({
  config: {
    nearNetwork: 'testnet',
  },
}));

vi.mock('../../src/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Import router after mocks
// ---------------------------------------------------------------------------

import express from 'express';
import request from 'supertest';
import { dataRouter } from '../../src/routes/data.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/data', dataRouter);
  return app;
}

/** Helper: encode a JSON value as an RPC call_function result. */
function rpcResult(value: unknown) {
  const bytes = Buffer.from(JSON.stringify(value), 'utf-8');
  return {
    result: Array.from(bytes),
    logs: [],
    block_height: 1,
    block_hash: 'abc',
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// GET /data/get
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /data/get', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns entries for valid keys', async () => {
    const entries = [{ key: 'alice/post/1', value: { text: 'Hello' } }];
    mockRpcQuery.mockResolvedValue(rpcResult(entries));

    const res = await request(createApp()).get('/data/get?keys=alice/post/1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(entries);

    // Verify RPC was called with correct args
    const call = mockRpcQuery.mock.calls[0][0];
    expect(call.account_id).toBe('core.onsocial.testnet');
    expect(call.method_name).toBe('get');
    const args = JSON.parse(Buffer.from(call.args_base64, 'base64').toString());
    expect(args.keys).toEqual(['alice/post/1']);
  });

  it('accepts multiple comma-separated keys', async () => {
    mockRpcQuery.mockResolvedValue(rpcResult([]));

    const res = await request(createApp()).get('/data/get?keys=a,b,c');
    expect(res.status).toBe(200);
    const args = JSON.parse(
      Buffer.from(
        mockRpcQuery.mock.calls[0][0].args_base64,
        'base64'
      ).toString()
    );
    expect(args.keys).toEqual(['a', 'b', 'c']);
  });

  it('passes accountId to RPC when provided', async () => {
    mockRpcQuery.mockResolvedValue(rpcResult([]));

    await request(createApp()).get('/data/get?keys=k&accountId=bob.testnet');
    const args = JSON.parse(
      Buffer.from(
        mockRpcQuery.mock.calls[0][0].args_base64,
        'base64'
      ).toString()
    );
    expect(args.account_id).toBe('bob.testnet');
  });

  it('returns 400 when keys param is missing', async () => {
    const res = await request(createApp()).get('/data/get');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/keys/i);
  });

  it('returns 400 when keys param is empty', async () => {
    const res = await request(createApp()).get('/data/get?keys=');
    expect(res.status).toBe(400);
  });

  it('returns 400 when more than 100 keys', async () => {
    const keys = Array.from({ length: 101 }, (_, i) => `k${i}`).join(',');
    const res = await request(createApp()).get(`/data/get?keys=${keys}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/100/);
  });

  it('returns 502 when RPC call fails', async () => {
    mockRpcQuery.mockRejectedValue(new Error('timeout'));

    const res = await request(createApp()).get('/data/get?keys=k1');
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/RPC/i);
    expect(res.body.details).toMatch(/timeout/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /data/get-one
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /data/get-one', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a single entry', async () => {
    const entry = { key: 'alice/profile/name', value: 'Alice' };
    mockRpcQuery.mockResolvedValue(rpcResult(entry));

    const res = await request(createApp()).get(
      '/data/get-one?key=alice/profile/name'
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual(entry);

    const call = mockRpcQuery.mock.calls[0][0];
    expect(call.method_name).toBe('get_one');
  });

  it('returns 400 when key param is missing', async () => {
    const res = await request(createApp()).get('/data/get-one');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/key/i);
  });

  it('passes accountId to RPC', async () => {
    mockRpcQuery.mockResolvedValue(rpcResult(null));

    await request(createApp()).get(
      '/data/get-one?key=k&accountId=carol.testnet'
    );
    const args = JSON.parse(
      Buffer.from(
        mockRpcQuery.mock.calls[0][0].args_base64,
        'base64'
      ).toString()
    );
    expect(args.account_id).toBe('carol.testnet');
  });

  it('returns 502 on RPC failure', async () => {
    mockRpcQuery.mockRejectedValue(new Error('network error'));

    const res = await request(createApp()).get('/data/get-one?key=k');
    expect(res.status).toBe(502);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /data/keys
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /data/keys', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists keys by prefix', async () => {
    const keys = ['alice/post/1', 'alice/post/2'];
    mockRpcQuery.mockResolvedValue(rpcResult(keys));

    const res = await request(createApp()).get('/data/keys?prefix=alice/post/');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(keys);

    const call = mockRpcQuery.mock.calls[0][0];
    expect(call.method_name).toBe('list_keys');
    const args = JSON.parse(Buffer.from(call.args_base64, 'base64').toString());
    expect(args.prefix).toBe('alice/post/');
    expect(args.limit).toBe(50); // default
    expect(args.with_values).toBe(false);
  });

  it('passes pagination and withValues params', async () => {
    mockRpcQuery.mockResolvedValue(rpcResult([]));

    await request(createApp()).get(
      '/data/keys?prefix=p&fromKey=k5&limit=10&withValues=true'
    );
    const args = JSON.parse(
      Buffer.from(
        mockRpcQuery.mock.calls[0][0].args_base64,
        'base64'
      ).toString()
    );
    expect(args.from_key).toBe('k5');
    expect(args.limit).toBe(10);
    expect(args.with_values).toBe(true);
  });

  it('clamps limit to max 50', async () => {
    mockRpcQuery.mockResolvedValue(rpcResult([]));

    await request(createApp()).get('/data/keys?prefix=p&limit=500');
    const args = JSON.parse(
      Buffer.from(
        mockRpcQuery.mock.calls[0][0].args_base64,
        'base64'
      ).toString()
    );
    expect(args.limit).toBe(50);
  });

  it('returns 400 when prefix is missing', async () => {
    const res = await request(createApp()).get('/data/keys');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/prefix/i);
  });

  it('returns 502 on RPC failure', async () => {
    mockRpcQuery.mockRejectedValue(new Error('RPC down'));

    const res = await request(createApp()).get('/data/keys?prefix=p');
    expect(res.status).toBe(502);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /data/count
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /data/count', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns count for a prefix', async () => {
    mockRpcQuery.mockResolvedValue(rpcResult(42));

    const res = await request(createApp()).get(
      '/data/count?prefix=alice/post/'
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ count: 42 });

    const call = mockRpcQuery.mock.calls[0][0];
    expect(call.method_name).toBe('count_keys');
  });

  it('returns 400 when prefix is missing', async () => {
    const res = await request(createApp()).get('/data/count');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/prefix/i);
  });

  it('returns 502 on RPC failure', async () => {
    mockRpcQuery.mockRejectedValue(new Error('unavailable'));

    const res = await request(createApp()).get('/data/count?prefix=p');
    expect(res.status).toBe(502);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Token (NEP-141) views
// ═══════════════════════════════════════════════════════════════════════════

describe('Token views', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /data/ft-metadata routes to token contract', async () => {
    mockRpcQuery.mockResolvedValue(
      rpcResult({
        spec: 'ft-1.0.0',
        name: 'OnSocial',
        symbol: 'SOCIAL',
        decimals: 24,
      })
    );
    const res = await request(createApp()).get('/data/ft-metadata');
    expect(res.status).toBe(200);
    expect(res.body.symbol).toBe('SOCIAL');
    const call = mockRpcQuery.mock.calls[0][0];
    expect(call.account_id).toBe('token.onsocial.testnet');
    expect(call.method_name).toBe('ft_metadata');
  });

  it('GET /data/ft-total-supply', async () => {
    mockRpcQuery.mockResolvedValue(rpcResult('1000'));
    const res = await request(createApp()).get('/data/ft-total-supply');
    expect(res.status).toBe(200);
    expect(res.body).toBe('1000');
    expect(mockRpcQuery.mock.calls[0][0].method_name).toBe('ft_total_supply');
  });

  it('GET /data/ft-balance-of requires accountId', async () => {
    const res = await request(createApp()).get('/data/ft-balance-of');
    expect(res.status).toBe(400);
  });

  it('GET /data/ft-balance-of returns balance', async () => {
    mockRpcQuery.mockResolvedValue(rpcResult('42'));
    const res = await request(createApp()).get(
      '/data/ft-balance-of?accountId=alice.testnet'
    );
    expect(res.status).toBe(200);
    expect(res.body).toBe('42');
    const args = JSON.parse(
      Buffer.from(
        mockRpcQuery.mock.calls[0][0].args_base64,
        'base64'
      ).toString()
    );
    expect(args).toEqual({ account_id: 'alice.testnet' });
  });

  it('GET /data/ft-storage-balance returns null for unregistered', async () => {
    mockRpcQuery.mockResolvedValue(rpcResult(null));
    const res = await request(createApp()).get(
      '/data/ft-storage-balance?accountId=bob.testnet'
    );
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
    expect(mockRpcQuery.mock.calls[0][0].method_name).toBe(
      'storage_balance_of'
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Boost views
// ═══════════════════════════════════════════════════════════════════════════

describe('Boost views', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /data/boost-stats routes to boost contract', async () => {
    mockRpcQuery.mockResolvedValue(
      rpcResult({
        version: '0.1.0',
        token_id: 'token.onsocial.testnet',
        owner_id: 'onsocial.testnet',
        total_locked: '0',
        total_effective_boost: '0',
        total_boost_seconds: '0',
        total_rewards_released: '0',
        scheduled_pool: '0',
        infra_pool: '0',
        last_release_time: 0,
        active_weekly_rate_bps: 0,
        release_schedule_start_ns: 0,
        initial_weekly_rate_bps: 0,
        rate_step_bps: 0,
        rate_step_interval_months: 0,
        max_weekly_rate_bps: 0,
      })
    );
    const res = await request(createApp()).get('/data/boost-stats');
    expect(res.status).toBe(200);
    expect(res.body.token_id).toBe('token.onsocial.testnet');
    const call = mockRpcQuery.mock.calls[0][0];
    expect(call.account_id).toBe('boost.onsocial.testnet');
    expect(call.method_name).toBe('get_stats');
  });

  it('GET /data/boost-account requires accountId', async () => {
    const res = await request(createApp()).get('/data/boost-account');
    expect(res.status).toBe(400);
  });

  it('GET /data/boost-account returns AccountView', async () => {
    mockRpcQuery.mockResolvedValue(
      rpcResult({
        locked_amount: '0',
        unlock_at: 0,
        lock_months: 0,
        effective_boost: '0',
        claimable_rewards: '0',
        boost_seconds: '0',
        rewards_claimed: '0',
      })
    );
    const res = await request(createApp()).get(
      '/data/boost-account?accountId=alice.testnet'
    );
    expect(res.status).toBe(200);
    expect(res.body.locked_amount).toBe('0');
    expect(mockRpcQuery.mock.calls[0][0].method_name).toBe('get_account');
  });

  it('GET /data/boost-lock-status', async () => {
    mockRpcQuery.mockResolvedValue(
      rpcResult({
        is_locked: false,
        locked_amount: '0',
        lock_months: 0,
        unlock_at: 0,
        can_unlock: false,
        time_remaining_ns: 0,
        bonus_percent: 0,
        effective_boost: '0',
        lock_expired: false,
      })
    );
    const res = await request(createApp()).get(
      '/data/boost-lock-status?accountId=alice.testnet'
    );
    expect(res.status).toBe(200);
    expect(res.body.is_locked).toBe(false);
    expect(mockRpcQuery.mock.calls[0][0].method_name).toBe('get_lock_status');
  });

  it('GET /data/boost-reward-rate', async () => {
    mockRpcQuery.mockResolvedValue(
      rpcResult({
        claimable_now: '0',
        rewards_per_second: '0',
        effective_boost: '0',
        total_effective_boost: '0',
        weekly_pool_release: '0',
        active_weekly_rate_bps: 0,
      })
    );
    const res = await request(createApp()).get(
      '/data/boost-reward-rate?accountId=alice.testnet'
    );
    expect(res.status).toBe(200);
    expect(mockRpcQuery.mock.calls[0][0].method_name).toBe('get_reward_rate');
  });

  it('GET /data/boost-storage-subsidy-available', async () => {
    mockRpcQuery.mockResolvedValue(rpcResult(123));
    const res = await request(createApp()).get(
      '/data/boost-storage-subsidy-available'
    );
    expect(res.status).toBe(200);
    expect(res.body).toBe(123);
    expect(mockRpcQuery.mock.calls[0][0].method_name).toBe(
      'get_storage_subsidy_available'
    );
  });

  it('GET /data/boost-storage-balance', async () => {
    mockRpcQuery.mockResolvedValue(rpcResult(null));
    const res = await request(createApp()).get(
      '/data/boost-storage-balance?accountId=alice.testnet'
    );
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
    expect(mockRpcQuery.mock.calls[0][0].method_name).toBe(
      'storage_balance_of'
    );
  });
});
