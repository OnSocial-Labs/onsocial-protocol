import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock dependencies BEFORE importing the module under test
// ---------------------------------------------------------------------------

// near.ts — creditOnChain & viewContract
const mockCreditOnChain = vi.fn();
const mockViewContract = vi.fn();
vi.mock('../../src/services/near.js', () => ({
  creditOnChain: (...args: unknown[]) => mockCreditOnChain(...args),
  claimOnChain: vi.fn(),
  viewContract: (...args: unknown[]) => mockViewContract(...args),
}));

// partnerAuth — pass through with a configurable app_id
let testAppId = 'test_partner';
vi.mock('../../src/middleware/partnerAuth.js', () => ({
  partnerAuth: (
    req: Record<string, unknown>,
    _res: unknown,
    next: () => void
  ) => {
    req.partnerAppId = testAppId;
    next();
  },
}));

// logger — silence output
vi.mock('../../src/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// db — not used directly by partner routes but pulled in by partnerAuth
vi.mock('../../src/db/index.js', () => ({
  query: vi.fn(),
}));

import express from 'express';
import request from 'supertest';

// We need a fresh module for each test suite to reset the
// module-level rewardAmountCache. Use dynamic import via
// vi.importActual approach — but simpler: just reset mocks
// and accept the cache is shared within a single test file.
import partnerRoutes from '../../src/routes/partner.js';

// Build a minimal Express app with the partner routes
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/v1', partnerRoutes);
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /v1/reward', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects when account_id is missing', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/v1/reward')
      .send({ source: 'message' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('account_id is required');
  });

  it('rejects when source is missing', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/v1/reward')
      .send({ account_id: 'alice.testnet' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('source is required');
  });

  it('passes explicit amount directly to creditOnChain', async () => {
    mockCreditOnChain.mockResolvedValue('txhash123');
    const app = buildApp();

    const res = await request(app).post('/v1/reward').send({
      account_id: 'alice.testnet',
      source: 'message',
      amount: '500000000000000000', // 0.5 SOCIAL
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.tx_hash).toBe('txhash123');
    expect(mockCreditOnChain).toHaveBeenCalledWith(
      'alice.testnet',
      '500000000000000000',
      'message',
      'test_partner'
    );
    // Should NOT call viewContract when amount is explicit
    expect(mockViewContract).not.toHaveBeenCalled();
  });

  it('resolves amount from on-chain config when not provided', async () => {
    mockViewContract.mockResolvedValue({
      reward_per_action: '100000000000000000', // 0.1 SOCIAL
    });
    mockCreditOnChain.mockResolvedValue('txhash456');
    const app = buildApp();

    const res = await request(app)
      .post('/v1/reward')
      .send({ account_id: 'alice.testnet', source: 'message' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockViewContract).toHaveBeenCalledWith('get_app_config', {
      app_id: 'test_partner',
    });
    expect(mockCreditOnChain).toHaveBeenCalledWith(
      'alice.testnet',
      '100000000000000000',
      'message',
      'test_partner'
    );
  });

  it('returns 400 when amount cannot be resolved', async () => {
    const savedAppId = testAppId;
    testAppId = 'unknown_app_' + Date.now();
    mockViewContract.mockResolvedValue(null);
    const app = buildApp();

    const res = await request(app)
      .post('/v1/reward')
      .send({ account_id: 'alice.testnet', source: 'message' });

    testAppId = savedAppId;
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Could not resolve reward amount');
  });

  it('caches resolved reward amount', async () => {
    const savedAppId = testAppId;
    testAppId = 'cache_test_' + Date.now();
    mockViewContract.mockResolvedValue({
      reward_per_action: '100000000000000000',
    });
    mockCreditOnChain.mockResolvedValue('tx1');
    const app = buildApp();

    // First call — triggers viewContract for this app_id
    await request(app)
      .post('/v1/reward')
      .send({ account_id: 'alice.testnet', source: 'message' });
    expect(mockViewContract).toHaveBeenCalledTimes(1);

    // Second call — should use cache, no extra viewContract call
    vi.clearAllMocks();
    mockCreditOnChain.mockResolvedValue('tx2');
    await request(app)
      .post('/v1/reward')
      .send({ account_id: 'bob.testnet', source: 'message' });
    expect(mockViewContract).not.toHaveBeenCalled();
    testAppId = savedAppId;
  });

  it('returns 502 when creditOnChain throws', async () => {
    mockCreditOnChain.mockRejectedValue(new Error('relayer down'));
    const app = buildApp();

    const res = await request(app).post('/v1/reward').send({
      account_id: 'alice.testnet',
      source: 'message',
      amount: '100000000000000000',
    });

    expect(res.status).toBe(502);
    expect(res.body.error).toBe('relayer down');
  });
});

describe('GET /v1/balance/:accountId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns claimable and app_reward', async () => {
    mockViewContract
      .mockResolvedValueOnce('400000000000000000') // get_claimable
      .mockResolvedValueOnce({
        // get_user_app_reward
        total_earned: '1000000000000000000',
        daily_earned: '200000000000000000',
        last_day: 20000,
      });

    const app = buildApp();
    const res = await request(app).get('/v1/balance/alice.testnet');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.claimable).toBe('400000000000000000');
    expect(res.body.app_id).toBe('test_partner');
    expect(res.body.app_reward.total_earned).toBe('1000000000000000000');
  });
});

describe('GET /v1/app', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns on-chain app config', async () => {
    mockViewContract.mockResolvedValue({
      label: 'Test Partner Bot',
      reward_per_action: '100000000000000000',
      daily_cap: '1000000000000000000',
      active: true,
    });

    const app = buildApp();
    const res = await request(app).get('/v1/app');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.config.label).toBe('Test Partner Bot');
    expect(res.body.app_id).toBe('test_partner');
  });
});
