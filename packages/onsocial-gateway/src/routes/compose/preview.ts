/**
 * Compose preview — mint-identical text-card PNG without IPFS upload.
 *
 * POST /compose/preview/text-card
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { logger } from '../../logger.js';
import {
  buildTextCardPng,
  ComposeError,
} from '../../services/compose/index.js';
import { parseJsonField, resolveActorId } from './helpers.js';

export const previewRouter = Router();

previewRouter.post(
  '/preview/text-card',
  async (req: Request, res: Response) => {
    const effectiveActorId = resolveActorId(req);

    try {
      const {
        title,
        description,
        creator,
        cardBg,
        cardFont,
        cardMarkColor,
        cardMarkShape,
        cardTitleAlign,
        cardFormat,
        cardPalette,
        cardPhotoCid,
        postId,
        issuedAt,
      } = req.body;

      if (!title || typeof title !== 'string') {
        res.status(400).json({ error: 'Missing required field: title' });
        return;
      }

      const parsedCreator = parseJsonField<{
        accountId: string;
        displayName?: string;
        avatar?: string;
      }>(creator);
      if (typeof creator === 'string' && parsedCreator === undefined) {
        res.status(400).json({ error: 'Invalid JSON in creator field' });
        return;
      }

      const issuedAtMs =
        typeof issuedAt === 'number' && Number.isFinite(issuedAt)
          ? issuedAt
          : typeof issuedAt === 'string' && /^\d+$/.test(issuedAt)
            ? Number(issuedAt)
            : undefined;

      const { png, themeExtra } = await buildTextCardPng(effectiveActorId, {
        title,
        ...(typeof description === 'string' ? { description } : {}),
        ...(parsedCreator ? { creator: parsedCreator } : {}),
        ...(typeof cardBg === 'string' ? { cardBg } : {}),
        ...(typeof cardFont === 'string' ? { cardFont } : {}),
        ...(typeof cardMarkColor === 'string' ? { cardMarkColor } : {}),
        ...(typeof cardMarkShape === 'string' ? { cardMarkShape } : {}),
        ...(typeof cardTitleAlign === 'string' ? { cardTitleAlign } : {}),
        ...(typeof cardFormat === 'string' ? { cardFormat } : {}),
        ...(typeof cardPalette === 'string' ? { cardPalette } : {}),
        ...(typeof cardPhotoCid === 'string' ? { cardPhotoCid } : {}),
        ...(typeof postId === 'string' && postId ? { postId } : {}),
        ...(issuedAtMs != null ? { issuedAt: issuedAtMs } : {}),
      });

      res.status(200).json({
        mediaType: 'image/png',
        dataUri: `data:image/png;base64,${png.toString('base64')}`,
        theme: themeExtra,
        width: 1200,
        height: 1200,
      });
    } catch (err) {
      if (err instanceof ComposeError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      logger.error(
        { err, accountId: effectiveActorId },
        'Compose preview/text-card failed'
      );
      res.status(500).json({ error: 'Compose preview/text-card failed' });
    }
  }
);
