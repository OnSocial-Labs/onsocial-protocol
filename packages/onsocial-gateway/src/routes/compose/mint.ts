/**
 * Compose routes: Mint — mint NFTs with auto-uploaded media + metadata.
 *
 * POST /mint          — Upload + relay via intent auth
 * POST /prepare/mint  — Upload only, return action for SDK signing
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import { logger } from '../../logger.js';
import {
  composeMint,
  buildMintAction,
  ComposeError,
} from '../../services/compose/index.js';
import { parseJsonField, extractImageFile, resolveActorId } from './helpers.js';

export const mintRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 1024, files: 50 },
});

// ---------------------------------------------------------------------------
// POST /compose/mint — Mint NFT with auto-uploaded media + metadata
//
// multipart/form-data:
//   Fields: title (required), description, copies, collectionId, extra (JSON),
//           royalty (JSON), appId, quantity, receiverId, targetAccount
//   Files:  image (single file — only used for QuickMint, ignored for collection mint)
//
// Examples:
//   // QuickMint with image
//   FormData: title="My Art", description="A sunset", image=<file>
//
//   // MintFromCollection (no image needed — collection has its own metadata)
//   FormData: title="unused", collectionId="col-001", quantity="3"
// ---------------------------------------------------------------------------
mintRouter.post(
  '/mint',
  upload.single('image'),
  async (req: Request, res: Response) => {
    const accountId = req.auth!.accountId;
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

      const imageFile = extractImageFile(req.file);

      const result = await composeMint(
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
        },
        imageFile
      );

      res.status(201).json({
        txHash: result.txHash,
        media: result.media
          ? {
              cid: result.media.cid,
              url: result.media.url,
              size: result.media.size,
              hash: result.media.hash,
            }
          : undefined,
        metadata: result.metadata
          ? {
              cid: result.metadata.cid,
              url: result.metadata.url,
              size: result.metadata.size,
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
        'Compose mint failed'
      );
      res.status(500).json({ error: 'Compose mint failed' });
    }
  }
);

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
    const accountId = req.auth!.accountId;
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

      const imageFile = extractImageFile(req.file);

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
