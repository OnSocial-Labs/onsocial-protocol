/**
 * Generative render jobs — queue, progress, and lifecycle.
 *
 * Rendering a 10k set takes minutes, so generation runs as a background job
 * the app polls: POST creates a job and returns immediately; GET reports
 * `queued → rendering → pinning → done | failed` with piece-level progress.
 *
 * One render runs at a time per gateway process (sharp saturates the libuv
 * threadpool on its own), each account may hold one active job, and
 * finished jobs are retained for an hour so slow pollers still see the
 * result. Temp files are always cleaned up, win or lose.
 */

import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { UploadedFile } from './shared.js';
import { ComposeError, logger } from './shared.js';
import type { GenerativeRecipe } from './generative.js';
import { renderGenerativeSet } from './generative.js';
import type { VariationSetArchiveResult } from './variation-set.js';

export type GenerateJobState =
  | 'queued'
  | 'rendering'
  | 'pinning'
  | 'done'
  | 'failed';

export interface GenerateJobView {
  jobId: string;
  state: GenerateJobState;
  progress: { done: number; total: number };
  result?: VariationSetArchiveResult;
  error?: string;
}

interface GenerateJob extends GenerateJobView {
  accountId: string;
  recipe: GenerativeRecipe;
  images: UploadedFile[];
  updatedAtMs: number;
}

const ACTIVE_STATES: GenerateJobState[] = ['queued', 'rendering', 'pinning'];
const FINISHED_JOB_TTL_MS = 60 * 60 * 1000;

const jobs = new Map<string, GenerateJob>();
const queue: string[] = [];
let running = false;

/** @internal Test-only: drop all job state. */
export function __resetGenerateJobs(): void {
  jobs.clear();
  queue.length = 0;
  running = false;
}

function sweepFinishedJobs(): void {
  const cutoff = Date.now() - FINISHED_JOB_TTL_MS;
  for (const [id, job] of jobs) {
    if (!ACTIVE_STATES.includes(job.state) && job.updatedAtMs < cutoff) {
      jobs.delete(id);
    }
  }
}

function toView(job: GenerateJob): GenerateJobView {
  return {
    jobId: job.jobId,
    state: job.state,
    progress: { ...job.progress },
    ...(job.result ? { result: job.result } : {}),
    ...(job.error ? { error: job.error } : {}),
  };
}

/**
 * Enqueue a render job. The recipe must already be parsed/validated
 * (`parseGenerativeRecipe` + `validateLayerImages`).
 */
export function createGenerateJob(
  accountId: string,
  recipe: GenerativeRecipe,
  images: UploadedFile[]
): GenerateJobView {
  sweepFinishedJobs();

  const active = [...jobs.values()].find(
    (job) => job.accountId === accountId && ACTIVE_STATES.includes(job.state)
  );
  if (active) {
    throw new ComposeError(
      429,
      'You already have a set rendering — wait for it to finish before starting another'
    );
  }

  const job: GenerateJob = {
    jobId: randomUUID(),
    accountId,
    state: 'queued',
    progress: { done: 0, total: recipe.supply },
    recipe,
    images,
    updatedAtMs: Date.now(),
  };
  jobs.set(job.jobId, job);
  queue.push(job.jobId);
  // Snapshot the queued state before the pump starts mutating the job.
  const view = toView(job);
  void pump();
  return view;
}

/** Look up a job — scoped to its creator so jobs stay private. */
export function getGenerateJob(
  accountId: string,
  jobId: string
): GenerateJobView | undefined {
  const job = jobs.get(jobId);
  if (!job || job.accountId !== accountId) return undefined;
  return toView(job);
}

async function pump(): Promise<void> {
  if (running) return;
  const jobId = queue.shift();
  if (!jobId) return;
  running = true;
  try {
    await runJob(jobId);
  } finally {
    running = false;
    if (queue.length > 0) void pump();
  }
}

async function runJob(jobId: string): Promise<void> {
  const job = jobs.get(jobId);
  if (!job) return;

  let tmpDir: string | undefined;
  try {
    job.state = 'rendering';
    job.updatedAtMs = Date.now();
    tmpDir = await mkdtemp(join(tmpdir(), 'onsocial-gen-'));

    const result = await renderGenerativeSet({
      recipe: job.recipe,
      images: job.images,
      tmpDir,
      onProgress: (progress) => {
        job.progress = progress;
        job.updatedAtMs = Date.now();
        // Rendering done, uploads in flight.
        if (progress.done === progress.total) job.state = 'pinning';
      },
    });

    job.state = 'done';
    job.result = result;
  } catch (error) {
    job.state = 'failed';
    job.error =
      error instanceof ComposeError
        ? String(error.details)
        : 'Rendering the set failed — try again';
    logger.error(
      { error, jobId, accountId: job.accountId },
      'Generative render job failed'
    );
  } finally {
    job.updatedAtMs = Date.now();
    // Input buffers are no longer needed once the job is terminal.
    job.images = [];
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
