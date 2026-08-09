import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockListMutes = vi.fn();
const mockAddMute = vi.fn();
const mockRemoveMute = vi.fn();

vi.mock('../../src/services/mutes/index.js', () => ({
  listMutes: (...args: unknown[]) => mockListMutes(...args),
  addMute: (...args: unknown[]) => mockAddMute(...args),
  removeMute: (...args: unknown[]) => mockRemoveMute(...args),
}));

vi.mock('../../src/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import express from 'express';
import request from 'supertest';
import { muteRouter } from '../../src/routes/mutes.js';

function createApp(auth?: {
  accountId: string;
  method: 'jwt' | 'apikey';
  tier?: 'free' | 'pro' | 'scale' | 'service';
}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (auth) {
      req.auth = {
        ...auth,
        tier: auth.tier ?? 'free',
        iat: 0,
        exp: 0,
      };
    }
    req.log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never;
    next();
  });
  app.use('/developer', muteRouter);
  return app;
}

describe('GET /developer/mutes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires auth', async () => {
    const res = await request(createApp()).get('/developer/mutes');
    expect(res.status).toBe(401);
  });

  it('lists mutes for the authenticated account', async () => {
    mockListMutes.mockResolvedValue([
      { mutedAccountId: 'bob.near', createdAt: '2026-01-01T00:00:00.000Z' },
    ]);
    const res = await request(
      createApp({ accountId: 'alice.near', method: 'jwt' })
    ).get('/developer/mutes');
    expect(res.status).toBe(200);
    expect(res.body.mutes).toHaveLength(1);
    expect(mockListMutes).toHaveBeenCalledWith('alice.near');
  });
});

describe('POST /developer/mutes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('adds a mute', async () => {
    mockAddMute.mockResolvedValue({
      mutedAccountId: 'bob.near',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const res = await request(
      createApp({ accountId: 'alice.near', method: 'jwt' })
    )
      .post('/developer/mutes')
      .send({ mutedAccountId: 'bob.near' });
    expect(res.status).toBe(201);
    expect(res.body.mute.mutedAccountId).toBe('bob.near');
  });

  it('rejects self-mute', async () => {
    mockAddMute.mockResolvedValue({
      code: 'SELF_MUTE',
      message: 'You cannot mute yourself',
    });
    const res = await request(
      createApp({ accountId: 'alice.near', method: 'jwt' })
    )
      .post('/developer/mutes')
      .send({ mutedAccountId: 'alice.near' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SELF_MUTE');
  });
});

describe('DELETE /developer/mutes/:mutedAccountId', () => {
  beforeEach(() => vi.clearAllMocks());

  it('removes a mute', async () => {
    mockRemoveMute.mockResolvedValue(true);
    const res = await request(
      createApp({ accountId: 'alice.near', method: 'jwt' })
    ).delete('/developer/mutes/bob.near');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(mockRemoveMute).toHaveBeenCalledWith('alice.near', 'bob.near');
  });
});
