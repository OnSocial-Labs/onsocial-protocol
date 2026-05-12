/**
 * Compose routes: Mint — mint Scarces with auto-uploaded media + metadata.
 *
 * POST /prepare/mint  — Upload media + build action; SDK signs and posts /relay/delegate.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import { logger } from '../../logger.js';
import { buildMintAction, ComposeError } from '../../services/compose/index.js';
import { parseJsonField, extractImageFile, resolveActorId } from './helpers.js';

export const mintRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 1024, files: 50 },
});

// ---------------------------------------------------------------------------
// POST /compose/prepare/mint — Build mint action without relaying
//
// Same input as /compose/mint. Uploads media + metadata JSON to Lighthouse,
// returns the built action so the SDK can sign and relay.
//
// Response:
//   {
//     action:         { type: "quick_mint", metadata: {...} },
//     target_account: "scarces.onsocial.testnet",
//     media:          { cid, url, size, hash },
//     metadata:       { cid, url, size, hash }
//   }
// ---------------------------------------------------------------------------
mintRouter.post(
  '/prepare/mint',
  upload.single('image'),
  async (req: Request, res: Response) => {
    const effectiveActorId = resolveActorId(req);

    try {
      const {
        title,
        description,
        copies,
        collectionId,
        extra,
        targetAccount,
        quantity,
        receiverId,
        royalty,
        appId,
        mediaCid,
        mediaHash,
        skipAutoMedia,
        creator,
        cardBg,
        cardFont,
        cardMarkColor,
        cardMarkShape,
        cardTitleAlign,
        cardPhotoCid,
      } = req.body;

      if (!title || typeof title !== 'string') {
        res.status(400).json({ error: 'Missing required field: title' });
        return;
      }

      const parsedExtra = parseJsonField(extra);
      if (typeof extra === 'string' && parsedExtra === undefined) {
        res.status(400).json({ error: 'Invalid JSON in extra field' });
        return;
      }

      const parsedRoyalty = parseJsonField<Record<string, number>>(royalty);
      if (typeof royalty === 'string' && parsedRoyalty === undefined) {
        res.status(400).json({ error: 'Invalid JSON in royalty field' });
        return;
      }

      const parsedCreator = parseJsonField<{
        accountId: string;
        displayName?: string;
      }>(creator);
      if (typeof creator === 'string' && parsedCreator === undefined) {
        res.status(400).json({ error: 'Invalid JSON in creator field' });
        return;
      }

      const imageFile = extractImageFile(req.file);
      const skipAuto =
        skipAutoMedia === true ||
        skipAutoMedia === 'true' ||
        skipAutoMedia === '1';

      const built = await buildMintAction(
        effectiveActorId,
        {
          title,
          ...(description && { description }),
          ...(copies && { copies: parseInt(copies, 10) }),
          ...(collectionId && { collectionId }),
          ...(quantity && { quantity: parseInt(quantity, 10) }),
          ...(receiverId && { receiverId }),
          ...(parsedExtra && { extra: parsedExtra }),
          ...(parsedRoyalty && { royalty: parsedRoyalty }),
          ...(appId && { appId }),
          ...(targetAccount && { targetAccount }),
          ...(mediaCid && { mediaCid }),
          ...(mediaHash && { mediaHash }),
          ...(skipAuto && { skipAutoMedia: true }),
          ...(parsedCreator && { creator: parsedCreator }),
          ...(typeof cardBg === 'string' && cardBg && { cardBg }),
          ...(typeof cardFont === 'string' && cardFont && { cardFont }),
          ...(typeof cardMarkColor === 'string' &&
            cardMarkColor && { cardMarkColor }),
          ...(typeof cardMarkShape === 'string' &&
            cardMarkShape && { cardMarkShape }),
          ...(typeof cardTitleAlign === 'string' &&
            cardTitleAlign && { cardTitleAlign }),
          ...(typeof cardPhotoCid === 'string' &&
            cardPhotoCid && { cardPhotoCid }),
        },
        imageFile
      );

      res.status(200).json({
        action: built.action,
        target_account: built.targetAccount,
        media: built.media
          ? {
              cid: built.media.cid,
              url: built.media.url,
              size: built.media.size,
              hash: built.media.hash,
            }
          : undefined,
        metadata: built.metadata
          ? {
              cid: built.metadata.cid,
              url: built.metadata.url,
              size: built.metadata.size,
              hash: built.metadata.hash,
            }
          : undefined,
      });
    } catch (error) {
      if (error instanceof ComposeError) {
        res.status(error.status).json({ error: error.details });
        return;
      }
      logger.error(
        { error, accountId: req.auth!.accountId },
        'Compose prepare/mint failed'
      );
      res.status(500).json({ error: 'Compose prepare/mint failed' });
    }
  }
);
