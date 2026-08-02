/**
 * Tests for generative render jobs: queueing, per-account limits, progress,
 * completion, failure, and job privacy.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import sharp from 'sharp';
import { mockUploadDiskDirectory, makeFile } from './helpers.js';
import {
  createGenerateJob,
  getGenerateJob,
  parseGenerativeRecipe,
  __resetGenerateJobs,
  ComposeError,
} from '../../../src/services/compose/index.js';
import type { UploadedFile } from '../../../src/services/compose/index.js';

async function layerImages(): Promise<UploadedFile[]> {
  const make = async (background: {
    r: number;
    g: number;
    b: number;
    alpha: number;
  }) => {
    const buffer = await sharp({
      create: { width: 2, height: 2, channels: 4, background },
    })
      .png()
      .toBuffer();
    return makeFile({
      originalname: 'layer.png',
      mimetype: 'image/png',
      buffer,
      size: buffer.length,
    });
  };
  return Promise.all([
    make({ r: 255, g: 0, b: 0, alpha: 1 }),
    make({ r: 0, g: 0, b: 255, alpha: 1 }),
  ]);
}

const RECIPE = parseGenerativeRecipe({
  supply: 2,
  layers: [
    {
      name: 'Background',
      noneWeight: 0,
      traits: [
        { name: 'Red', weight: 1, image: 0 },
        { name: 'Blue', weight: 1, image: 1 },
      ],
    },
  ],
});

async function waitForTerminal(accountId: string, jobId: string) {
  return vi.waitFor(
    () => {
      const job = getGenerateJob(accountId, jobId);
      if (!job || (job.state !== 'done' && job.state !== 'failed')) {
        throw new Error('job still running');
      }
      return job;
    },
    { timeout: 10_000, interval: 25 }
  );
}

describe('generate jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetGenerateJobs();
  });

  it('runs a job to completion with progress and pinned CIDs', async () => {
    mockUploadDiskDirectory
      .mockResolvedValueOnce({ dirHash: 'QmJobArt', entries: [] })
      .mockResolvedValueOnce({ dirHash: 'QmJobTraits', entries: [] });

    const created = createGenerateJob(
      'creator.testnet',
      RECIPE,
      await layerImages()
    );
    expect(created.state).toBe('queued');
    expect(created.progress).toEqual({ done: 0, total: 2 });

    const finished = await waitForTerminal('creator.testnet', created.jobId);
    expect(finished.state).toBe('done');
    expect(finished.progress).toEqual({ done: 2, total: 2 });
    expect(finished.result?.variations.cid).toBe('QmJobArt');
    expect(finished.result?.reference?.cid).toBe('QmJobTraits');
  });

  it('limits each account to one active job', { timeout: 15_000 }, async () => {
    // Keep the first job pinned in-flight so the second create sees it active.
    let releasePin: () => void = () => {};
    const pinStarted = new Promise<void>((started) => {
      mockUploadDiskDirectory.mockImplementationOnce(() => {
        started();
        return new Promise((resolve) => {
          releasePin = () => resolve({ dirHash: 'QmSlowArt', entries: [] });
        });
      });
    });
    mockUploadDiskDirectory.mockResolvedValue({
      dirHash: 'QmSlowTraits',
      entries: [],
    });

    const images = await layerImages();
    const first = createGenerateJob('creator.testnet', RECIPE, images);
    await pinStarted;

    expect(() => createGenerateJob('creator.testnet', RECIPE, images)).toThrow(
      ComposeError
    );

    // A different account is not blocked by someone else's render.
    const other = createGenerateJob('other.testnet', RECIPE, images);
    expect(other.state).toBe('queued');

    releasePin();
    await waitForTerminal('creator.testnet', first.jobId);
    await waitForTerminal('other.testnet', other.jobId);
  });

  it('marks the job failed when rendering cannot pin', async () => {
    mockUploadDiskDirectory.mockRejectedValue(
      new Error('lighthouse unavailable')
    );

    const created = createGenerateJob(
      'creator.testnet',
      RECIPE,
      await layerImages()
    );
    const finished = await waitForTerminal('creator.testnet', created.jobId);
    expect(finished.state).toBe('failed');
    expect(finished.error).toContain('failed');
    expect(finished.result).toBeUndefined();
  });

  it('keeps jobs private to their creator', async () => {
    mockUploadDiskDirectory.mockResolvedValue({
      dirHash: 'QmPrivate',
      entries: [],
    });
    const created = createGenerateJob(
      'creator.testnet',
      RECIPE,
      await layerImages()
    );

    expect(getGenerateJob('stranger.testnet', created.jobId)).toBeUndefined();
    expect(getGenerateJob('creator.testnet', created.jobId)).toBeDefined();
    await waitForTerminal('creator.testnet', created.jobId);
  });
});
