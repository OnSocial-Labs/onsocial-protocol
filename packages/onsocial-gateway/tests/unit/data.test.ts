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
  return { result: Array.from(bytes), logs: [], block_height: 1, block_hash: 'abc' };
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
      Buffer.from(mockRpcQuery.mock.calls[0][0].args_base64, 'base64').toString()
    );
    expect(args.keys).toEqual(['a', 'b', 'c']);
  });

  it('passes accountId to RPC when provided', async () => {
    mockRpcQuery.mockResolvedValue(rpcResult([]));

    await request(createApp()).get('/data/get?keys=k&accountId=bob.testnet');
    const args = JSON.parse(
      Buffer.from(mockRpcQuery.mock.calls[0][0].args_base64, 'base64').toString()
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

    const res = await request(createApp()).get('/data/get-one?key=alice/profile/name');
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

    await request(createApp()).get('/data/get-one?key=k&accountId=carol.testnet');
    const args = JSON.parse(
      Buffer.from(mockRpcQuery.mock.calls[0][0].args_base64, 'base64').toString()
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
      Buffer.from(mockRpcQuery.mock.calls[0][0].args_base64, 'base64').toString()
    );
    expect(args.from_key).toBe('k5');
    expect(args.limit).toBe(10);
    expect(args.with_values).toBe(true);
  });

  it('clamps limit to max 50', async () => {
    mockRpcQuery.mockResolvedValue(rpcResult([]));

    await request(createApp()).get('/data/keys?prefix=p&limit=500');
    const args = JSON.parse(
      Buffer.from(mockRpcQuery.mock.calls[0][0].args_base64, 'base64').toString()
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

    const res = await request(createApp()).get('/data/count?prefix=alice/post/');
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
