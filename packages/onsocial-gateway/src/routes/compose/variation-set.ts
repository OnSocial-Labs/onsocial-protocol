/**
 * Compose routes: Variation sets — pin zipped drop sets as IPFS directories.
 *
 * POST /upload/variation-set — Unpack art (+ optional traits) ZIP archives,
 * validate the 1.<ext> … N.<ext> seat naming, pin each as one directory,
 * and return the CIDs for create-collection's variationsCid / referenceCid.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import { logger } from '../../logger.js';
import {
  ComposeError,
  uploadVariationSetArchives,
} from '../../services/compose/index.js';
import { extractImageFile } from './helpers.js';

export const variationSetRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 1024, files: 2 },
});

variationSetRouter.post(
  '/upload/variation-set',
  upload.fields([
    { name: 'images', maxCount: 1 },
    { name: 'traits', maxCount: 1 },
  ]),
  async (req: Request, res: Response) => {
    try {
      const fileGroups = req.files as
        | Record<string, Express.Multer.File[]>
        | undefined;
      const imagesZip = extractImageFile(fileGroups?.images?.[0]);
      const traitsZip = extractImageFile(fileGroups?.traits?.[0]);

      if (!imagesZip) {
        res.status(400).json({
          error: 'Missing images archive — attach a ZIP as the "images" field',
        });
        return;
      }

      const result = await uploadVariationSetArchives(imagesZip, traitsZip);

      res.status(200).json({
        variations: {
          cid: result.variations.cid,
          count: result.variations.count,
          ext: result.variations.ext,
          url_template: result.variations.urlTemplate,
        },
        reference: result.reference
          ? {
              cid: result.reference.cid,
              count: result.reference.count,
              ext: result.reference.ext,
              url_template: result.reference.urlTemplate,
            }
          : undefined,
      });
    } catch (error) {
      if (error instanceof ComposeError) {
        res.status(error.status).json({ error: error.details });
        return;
      }
      logger.error(
        { error, accountId: req.auth?.accountId },
        'Compose upload/variation-set failed'
      );
      res.status(500).json({ error: 'Compose upload/variation-set failed' });
    }
  }
);
