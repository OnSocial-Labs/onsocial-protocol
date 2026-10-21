/**
 * POST /v1/rpc — OnAPI JSON-RPC passthrough.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCall = vi.fn();

vi.mock('../../src/rpc/index.js', () => ({
  nearRpc: {
    call: (...args: unknown[]) => mockCall(...args),
  },
}));

vi.mock('../../src/config/index.js', () => ({
  config: {
    nearNetwork: 'testnet',
    nodeEnv: 'test',
    redisUrl: '',
    rateLimits: { free: 60, pro: 600, scale: 3000, service: 10000 },
  },
}));

vi.mock('../../src/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import express from 'express';
import request from 'supertest';
import { rpcRouter } from '../../src/routes/rpc.js';
import type { Tier } from '../../src/types/index.js';

function createApp(tier?: Tier) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (tier) {
      req.auth = {
        accountId: 'alice.testnet',
        tier,
        method: 'apikey',
        iat: 0,
        exp: 0,
      };
    }
    next();
  });
  app.use('/v1/rpc', rpcRouter);
  return app;
}

describe('POST /v1/rpc', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires an OnAPI key or session', async () => {
    const res = await request(createApp()).post('/v1/rpc').send({
      jsonrpc: '2.0',
      id: 1,
      method: 'status',
      params: {},
    });
    expect(res.status).toBe(401);
    expect(mockCall).not.toHaveBeenCalled();
  });

  it('reads any recent testnet account on the free tier', async () => {
    mockCall.mockResolvedValue({
      jsonrpc: '2.0',
      id: 'onsocial',
      result: { amount: '1' },
    });

    const params = {
      request_type: 'view_account',
      finality: 'final',
      account_id: 'test.near',
    };
    const res = await request(createApp('free'))
      .post('/v1/rpc')
      .send({ jsonrpc: '2.0', id: 7, method: 'query', params });

    expect(res.status).toBe(200);
    expect(res.body.result).toEqual({ amount: '1' });
    expect(res.body.id).toBe('7');
    expect(mockCall).toHaveBeenCalledWith('query', params);
  });

  it('broadcasts a caller-signed transaction', async () => {
    mockCall.mockResolvedValue({
      jsonrpc: '2.0',
      id: 'onsocial',
      result: 'txhash',
    });

    const res = await request(createApp('free'))
      .post('/v1/rpc')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'broadcast_tx_async',
        params: ['signed'],
      });

    expect(res.status).toBe(200);
    expect(res.body.result).toBe('txhash');
    expect(mockCall).toHaveBeenCalledWith('broadcast_tx_async', ['signed']);
  });

  it('rejects a pinned block on the free tier before calling upstream', async () => {
    const res = await request(createApp('free'))
      .post('/v1/rpc')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'block',
        params: { block_id: 1 },
      });

    expect(res.status).toBe(200);
    expect(res.body.error.code).toBe(-32001);
    expect(res.body.error.message).toMatch(/paid OnAPI tier/);
    expect(mockCall).not.toHaveBeenCalled();
  });

  it('rejects a pinned gas price on the free tier', async () => {
    const res = await request(createApp('free'))
      .post('/v1/rpc')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'gas_price',
        params: [10],
      });

    expect(res.body.error.code).toBe(-32001);
    expect(mockCall).not.toHaveBeenCalled();
  });

  it('allows the latest gas price on the free tier', async () => {
    mockCall.mockResolvedValue({
      jsonrpc: '2.0',
      id: 'onsocial',
      result: { gas_price: '1' },
    });

    const res = await request(createApp('free'))
      .post('/v1/rpc')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'gas_price',
        params: [null],
      });

    expect(res.status).toBe(200);
    expect(res.body.result.gas_price).toBe('1');
  });

  it('forwards a pinned block on a paid tier', async () => {
    mockCall.mockResolvedValue({
      jsonrpc: '2.0',
      id: 'onsocial',
      result: { header: { height: 1 } },
    });

    const res = await request(createApp('pro'))
      .post('/v1/rpc')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'block',
        params: { block_id: 1 },
      });

    expect(res.status).toBe(200);
    expect(res.body.result.header.height).toBe(1);
    expect(mockCall).toHaveBeenCalledOnce();
  });

  it('rejects methods outside the allowlist', async () => {
    const res = await request(createApp('scale')).post('/v1/rpc').send({
      jsonrpc: '2.0',
      id: 1,
      method: 'EXPERIMENTAL_changes',
      params: {},
    });

    expect(res.body.error.code).toBe(-32601);
    expect(mockCall).not.toHaveBeenCalled();
  });

  it('rejects a request for the other network', async () => {
    const res = await request(createApp('service')).post('/v1/rpc').send({
      jsonrpc: '2.0',
      id: 1,
      method: 'status',
      network: 'mainnet',
    });

    expect(res.body.error.message).toMatch(/testnet/);
    expect(mockCall).not.toHaveBeenCalled();
  });

  it('rejects a batch so one request cannot fan out', async () => {
    const res = await request(createApp('free'))
      .post('/v1/rpc')
      .send([
        { jsonrpc: '2.0', id: 1, method: 'status' },
        { jsonrpc: '2.0', id: 2, method: 'status' },
      ]);

    expect(res.body.error.code).toBe(-32600);
    expect(mockCall).not.toHaveBeenCalled();
  });

  it('returns 503 when every upstream fails', async () => {
    mockCall.mockRejectedValue(new Error('All NEAR RPC providers failed'));

    const res = await request(createApp('free'))
      .post('/v1/rpc')
      .send({ jsonrpc: '2.0', id: 1, method: 'status', params: [] });

    expect(res.status).toBe(503);
    expect(res.body.error.message).toBe('RPC upstream unavailable');
    expect(res.body.error.message).not.toMatch(/http/);
  });
});
