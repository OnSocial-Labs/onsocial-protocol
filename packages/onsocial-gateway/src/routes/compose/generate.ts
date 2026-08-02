/**
 * Compose routes: Generative rendering — server-side 10k-scale drops.
 *
 * POST /generate/variation-set      — Upload layer images + recipe, start a
 *                                     render job; returns { job_id } fast.
 * GET  /generate/variation-set/:id  — Poll job state and progress; when
 *                                     done, carries the pinned CIDs.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import { logger } from '../../logger.js';
import {
  ComposeError,
  parseGenerativeRecipe,
  validateLayerImages,
  createGenerateJob,
  getGenerateJob,
  type GenerateJobView,
} from '../../services/compose/index.js';
import { collectFiles, resolveActorId } from './helpers.js';

export const generateRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 200 },
});

function jobJson(job: GenerateJobView) {
  return {
    job_id: job.jobId,
    state: job.state,
    progress: job.progress,
    result: job.result
      ? {
          variations: {
            cid: job.result.variations.cid,
            count: job.result.variations.count,
            ext: job.result.variations.ext,
            url_template: job.result.variations.urlTemplate,
          },
          reference: job.result.reference
            ? {
                cid: job.result.reference.cid,
                count: job.result.reference.count,
                ext: job.result.reference.ext,
                url_template: job.result.reference.urlTemplate,
              }
            : undefined,
        }
      : undefined,
    error: job.error,
  };
}

generateRouter.post(
  '/generate/variation-set',
  upload.fields([{ name: 'layerImages', maxCount: 200 }]),
  async (req: Request, res: Response) => {
    try {
      const fileGroups = req.files as
        | Record<string, Express.Multer.File[]>
        | undefined;
      const images = collectFiles(fileGroups?.layerImages);
      const recipe = parseGenerativeRecipe(req.body?.recipe);
      validateLayerImages(recipe, images);

      const job = createGenerateJob(resolveActorId(req), recipe, images);
      res.status(202).json(jobJson(job));
    } catch (error) {
      if (error instanceof ComposeError) {
        res.status(error.status).json({ error: error.details });
        return;
      }
      logger.error(
        { error, accountId: req.auth?.accountId },
        'Compose generate/variation-set failed'
      );
      res.status(500).json({ error: 'Compose generate/variation-set failed' });
    }
  }
);

generateRouter.get(
  '/generate/variation-set/:jobId',
  (req: Request, res: Response) => {
    const job = getGenerateJob(resolveActorId(req), req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'Render job not found' });
      return;
    }
    res.status(200).json(jobJson(job));
  }
);
