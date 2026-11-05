import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const uploadNamedBufferToLighthouse = vi.hoisted(() => vi.fn());
const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../../src/services/storage/lighthouse-upload.js', () => ({
  uploadNamedBufferToLighthouse,
}));

vi.mock('../../src/logger.js', () => ({
  logger: loggerMock,
}));

vi.mock('../../src/middleware/index.js', () => ({
  requireAuth: (
    req: { auth?: unknown },
    res: { status: (code: number) => { json: (body: unknown) => void } },
    next: () => void
  ) => {
    if (!req.auth) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    next();
  },
}));

vi.mock('../../src/config/index.js', () => ({
  config: {
    lighthouseApiKey: 'test-key',
    lighthouseGatewayBase: 'https://cdn.testnet.onsocial.id/ipfs',
    redisUrl: '',
    nodeEnv: 'test',
    rateLimits: {
      free: 60,
      pro: 600,
      scale: 3000,
      service: 10000,
    },
  },
}));

import { storageRouter } from '../../src/services/storage/index.js';
import {
  IMAGE_VARIANT_WARM_CONCURRENCY,
  imageVariantWarmUrls,
  resetImageVariantWarmupForTests,
  scheduleImageVariantWarmup,
} from '../../src/services/storage/warm-image-variants.js';

const CID_A = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';
const CID_B = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
const GATEWAY_BASE = 'https://cdn.testnet.onsocial.id/ipfs';

function urlsFor(cid: string): string[] {
  return [128, 384, 1080].map(
    (width) => `https://cdn.testnet.onsocial.id/img/${width}/ipfs/${cid}`
  );
}

function createApp() {
  const app = express();
  app.use((req, _res, next) => {
    req.auth = {
      accountId: 'alice.testnet',
      tier: 'free',
      iat: 0,
      exp: 0,
    };
    next();
  });
  app.use('/storage', storageRouter);
  return app;
}

beforeEach(() => {
  resetImageVariantWarmupForTests();
  uploadNamedBufferToLighthouse.mockReset();
  uploadNamedBufferToLighthouse.mockResolvedValue({
    Hash: CID_A,
    Size: '4',
    Name: 'a.png',
  });
  loggerMock.warn.mockClear();
  vi.unstubAllGlobals();
});

describe('scheduleImageVariantWarmup', () => {
  it('requests the 128, 384, and 1080 variants and ignores other files', async () => {
    const fetchImpl = vi.fn(async () => new Response('ok'));

    scheduleImageVariantWarmup({
      cid: CID_A,
      mime: 'image/png',
      gatewayBase: GATEWAY_BASE,
      fetchImpl,
    });
    scheduleImageVariantWarmup({
      cid: CID_A,
      mime: 'image/gif',
      gatewayBase: GATEWAY_BASE,
      fetchImpl,
    });
    scheduleImageVariantWarmup({
      cid: CID_A,
      mime: 'text/plain',
      gatewayBase: GATEWAY_BASE,
      fetchImpl,
    });

    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(3));
    const called = fetchImpl.mock.calls.map((call) => call[0]);
    expect(called).toEqual(urlsFor(CID_A));
    expect(loggerMock.warn).not.toHaveBeenCalled();
  });

  it('caps in-flight warm-up requests', async () => {
    const pending: Array<(response: Response) => void> = [];
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          pending.push(resolve);
        })
    );

    scheduleImageVariantWarmup({
      cid: CID_A,
      mime: 'image/jpeg',
      gatewayBase: GATEWAY_BASE,
      fetchImpl,
    });
    scheduleImageVariantWarmup({
      cid: CID_B,
      mime: 'image/webp',
      gatewayBase: GATEWAY_BASE,
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(IMAGE_VARIANT_WARM_CONCURRENCY);

    pending
      .splice(0)
      .forEach((resolve) => resolve(new Response('ok', { status: 200 })));
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(6));
  });

  it('logs a failed warm-up and does not throw', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('cdn down');
    });

    expect(() =>
      scheduleImageVariantWarmup({
        cid: CID_A,
        mime: 'image/png',
        gatewayBase: GATEWAY_BASE,
        fetchImpl,
      })
    ).not.toThrow();

    await vi.waitFor(() => expect(loggerMock.warn).toHaveBeenCalled());
  });
});

describe('POST /storage/upload warm-up', () => {
  it('still stores the image when warm-up requests fail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('cdn down');
      })
    );

    const res = await request(createApp())
      .post('/storage/upload')
      .attach('file', Buffer.from('png'), {
        filename: 'a.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(200);
    expect(res.body.cid).toBe(CID_A);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    expect(loggerMock.warn).toHaveBeenCalled();
  });

  it('does not wait for warm-up before responding', async () => {
    let started = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>(() => {
            started += 1;
          })
      )
    );

    const res = await request(createApp())
      .post('/storage/upload')
      .attach('file', Buffer.from('png'), {
        filename: 'a.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(200);
    expect(res.body.cid).toBe(CID_A);
    expect(started).toBe(IMAGE_VARIANT_WARM_CONCURRENCY);
  });

  it('does not warm a non-image upload', async () => {
    const fetchImpl = vi.fn(async () => new Response('ok'));
    vi.stubGlobal('fetch', fetchImpl);

    const res = await request(createApp())
      .post('/storage/upload')
      .attach('file', Buffer.from('hello'), {
        filename: 'note.txt',
        contentType: 'text/plain',
      });

    expect(res.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('imageVariantWarmUrls', () => {
  it('builds resize URLs from the public image host', () => {
    expect(imageVariantWarmUrls(GATEWAY_BASE, CID_A)).toEqual(urlsFor(CID_A));
    expect(imageVariantWarmUrls(GATEWAY_BASE, '../etc/passwd')).toEqual([]);
  });
});
