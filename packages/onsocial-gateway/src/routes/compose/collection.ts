/**
 * Compose routes: Collection — create Scarces collections with auto-uploaded images.
 *
 * POST /prepare/create-collection  — Upload image + build action; SDK signs and posts /relay/delegate.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import { logger } from '../../logger.js';
import {
  buildCreateCollectionAction,
  ComposeError,
} from '../../services/compose/index.js';
import {
  parseJsonField,
  parseBool,
  extractImageFile,
  resolveActorId,
} from './helpers.js';

export const collectionRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 1024, files: 50 },
});

// ---------------------------------------------------------------------------
// Shared validation for create-collection routes
// ---------------------------------------------------------------------------

function validateCreateCollectionBody(
  body: Record<string, unknown>,
  res: Response
): boolean {
  const { collectionId, totalSupply, title } = body;
  if (!collectionId || typeof collectionId !== 'string') {
    res.status(400).json({ error: 'Missing required field: collectionId' });
    return false;
  }
  if (!totalSupply) {
    res.status(400).json({ error: 'Missing required field: totalSupply' });
    return false;
  }
  if (!title || typeof title !== 'string') {
    res.status(400).json({ error: 'Missing required field: title' });
    return false;
  }
  return true;
}

function buildCreateCollectionReq(body: Record<string, unknown>) {
  const {
    collectionId,
    totalSupply,
    title,
    description,
    priceNear,
    extra,
    startTime,
    endTime,
    royalty,
    appId,
    renewable,
    maxRedeems,
    mintMode,
    maxPerWallet,
    metadata,
    startPrice,
    allowlistPrice,
    transferable,
    burnable,
    mediaCid,
    mediaHash,
    targetAccount,
  } = body as Record<string, string | undefined>;

  const parsedExtra = parseJsonField(extra);
  const parsedRoyalty = parseJsonField<Record<string, number>>(royalty);

  return {
    req: {
      collectionId: collectionId as string,
      totalSupply: parseInt(totalSupply as string, 10),
      title: title as string,
      ...(priceNear && { priceNear: priceNear as string }),
      ...(description && { description }),
      ...(parsedExtra && { extra: parsedExtra }),
      ...(startTime && { startTime: parseInt(startTime, 10) }),
      ...(endTime && { endTime: parseInt(endTime, 10) }),
      ...(parsedRoyalty && { royalty: parsedRoyalty }),
      ...(appId && { appId }),
      ...(parseBool(renewable) != null && { renewable: parseBool(renewable) }),
      ...(maxRedeems && { maxRedeems: parseInt(maxRedeems, 10) }),
      ...(mintMode && { mintMode }),
      ...(maxPerWallet && { maxPerWallet: parseInt(maxPerWallet, 10) }),
      ...(metadata != null && { metadata }),
      ...(startPrice && { startPrice }),
      ...(allowlistPrice && { allowlistPrice }),
      ...(parseBool(transferable) != null && {
        transferable: parseBool(transferable),
      }),
      ...(parseBool(burnable) != null && { burnable: parseBool(burnable) }),
      ...(mediaCid && { mediaCid }),
      ...(mediaHash && { mediaHash }),
      ...(targetAccount && { targetAccount }),
    },
    parsedExtra,
    parsedRoyalty,
  };
}

// ---------------------------------------------------------------------------
// POST /compose/prepare/create-collection — Build create-collection action
// without relaying (for SDK signing)
//
// Same input as /compose/create-collection. Uploads image to Lighthouse,
// returns the built action so the SDK can sign and relay.
//
// Response:
//   {
//     action:         { type: "create_collection", ... },
//     target_account: "scarces.onsocial.testnet",
//     media:          { cid, url, size, hash }
//   }
// ---------------------------------------------------------------------------
collectionRouter.post(
  '/prepare/create-collection',
  upload.single('image'),
  async (req: Request, res: Response) => {
    const effectiveActorId = resolveActorId(req);

    try {
      if (!validateCreateCollectionBody(req.body, res)) return;

      const { extra, royalty } = req.body;

      if (typeof extra === 'string' && parseJsonField(extra) === undefined) {
        res.status(400).json({ error: 'Invalid JSON in extra field' });
        return;
      }
      if (
        typeof royalty === 'string' &&
        parseJsonField(royalty) === undefined
      ) {
        res.status(400).json({ error: 'Invalid JSON in royalty field' });
        return;
      }

      const { req: collectionReq } = buildCreateCollectionReq(req.body);
      const imageFile = extractImageFile(req.file);

      const built = await buildCreateCollectionAction(
        effectiveActorId,
        collectionReq,
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
      });
    } catch (error) {
      if (error instanceof ComposeError) {
        res.status(error.status).json({ error: error.details });
        return;
      }
      logger.error(
        { error, accountId: req.auth!.accountId },
        'Compose prepare/create-collection failed'
      );
      res
        .status(500)
        .json({ error: 'Compose prepare/create-collection failed' });
    }
  }
);
