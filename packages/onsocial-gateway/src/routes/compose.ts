/**
 * Compose routes — one-call content creation with automatic storage + relay.
 *
 * POST /compose/set   — Store content at any core contract path with optional media
 * POST /compose/mint  — Mint an NFT with auto-uploaded media + metadata
 *
 * All routes require JWT authentication. Rate limiting is handled by the
 * gateway-wide middleware (60/min free, 600/min pro) — no per-route metering.
 *
 * Media uploads go through Lighthouse (IPFS + Filecoin), then the contract
 * action is relayed gaslessly via the relayer.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/index.js';
import { logger } from '../logger.js';
import {
  composeSet,
  composeMint,
  buildSetAction,
  buildMintAction,
  ComposeError,
  type UploadedFile,
} from '../services/compose/index.js';

export const composeRouter = Router();

// Multer: in-memory storage, 1 GB per file, max 50 files
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 1024, files: 50 },
});

// All compose routes require auth (JWT or API key)
composeRouter.use(requireAuth);

// ---------------------------------------------------------------------------
// POST /compose/set — Store content at any path with optional file uploads
//
// Supports two modes:
//   1. multipart/form-data — with file uploads
//      Fields: path (required), value (JSON string), mediaField (optional)
//      Files: any field name → uploaded to Lighthouse, CID injected into value
//
//   2. application/json — no file uploads
//      Body: { path, value, mediaField?, targetAccount? }
//
// Examples:
//   // Post with image
//   FormData: path="post/main", value='{"text":"Hello"}', mediaField="image", image=<file>
//
//   // Group content
//   FormData: path="groups/dao/media/photo1", value='{"caption":"Meeting"}', media=<file>
//
//   // Profile update (no file)
//   JSON: { "path": "profile/bio", "value": {"text": "Developer"} }
//
//   // Multi-file upload
//   FormData: path="post/gallery", value='{"title":"Vacation"}', photo1=<f>, photo2=<f>
//
//   // Custom app data — any path you invent
//   JSON: { "path": "app/recipes/pasta/carbonara", "value": {"ingredients": [...]} }
// ---------------------------------------------------------------------------
composeRouter.post(
  '/set',
  upload.any(),
  async (req: Request, res: Response) => {
    const accountId = req.auth!.accountId;

    try {
      const path = req.body.path;
      if (!path || typeof path !== 'string') {
        res.status(400).json({ error: 'Missing required field: path' });
        return;
      }

      // Value can be a JSON string (multipart) or object (JSON body)
      let value: Record<string, unknown>;
      if (typeof req.body.value === 'string') {
        try {
          value = JSON.parse(req.body.value);
        } catch {
          res.status(400).json({ error: 'Invalid JSON in value field' });
          return;
        }
      } else if (
        typeof req.body.value === 'object' &&
        req.body.value !== null
      ) {
        value = req.body.value;
      } else {
        value = {};
      }

      const mediaField = req.body.mediaField || undefined;
      const targetAccount = req.body.targetAccount || undefined;

      // Collect uploaded files
      const files: UploadedFile[] = [];
      if (req.files && Array.isArray(req.files)) {
        for (const f of req.files) {
          files.push({
            fieldname: f.fieldname,
            originalname: f.originalname,
            buffer: f.buffer,
            mimetype: f.mimetype,
            size: f.size,
          });
        }
      }

      const result = await composeSet(
        accountId,
        { path, value, mediaField, targetAccount },
        files
      );

      res.status(201).json({
        txHash: result.txHash,
        path: result.path,
        uploads: Object.fromEntries(
          Object.entries(result.uploads).map(([k, v]) => [
            k,
            { cid: v.cid, url: v.url, size: v.size, hash: v.hash },
          ])
        ),
      });
    } catch (error) {
      if (error instanceof ComposeError) {
        res.status(error.status).json({ error: error.details });
        return;
      }
      logger.error({ error, accountId }, 'Compose set failed');
      res.status(500).json({ error: 'Compose set failed' });
    }
  }
);

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
composeRouter.post(
  '/mint',
  upload.single('image'),
  async (req: Request, res: Response) => {
    const accountId = req.auth!.accountId;

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
      } = req.body;

      if (!title || typeof title !== 'string') {
        res.status(400).json({ error: 'Missing required field: title' });
        return;
      }

      // Parse extra if it's a JSON string (multipart)
      let parsedExtra: Record<string, unknown> | undefined;
      if (typeof extra === 'string') {
        try {
          parsedExtra = JSON.parse(extra);
        } catch {
          res.status(400).json({ error: 'Invalid JSON in extra field' });
          return;
        }
      } else if (typeof extra === 'object' && extra !== null) {
        parsedExtra = extra;
      }

      // Parse royalty if it's a JSON string (multipart)
      let parsedRoyalty: Record<string, number> | undefined;
      if (typeof royalty === 'string') {
        try {
          parsedRoyalty = JSON.parse(royalty);
        } catch {
          res.status(400).json({ error: 'Invalid JSON in royalty field' });
          return;
        }
      } else if (typeof royalty === 'object' && royalty !== null) {
        parsedRoyalty = royalty;
      }

      const imageFile: UploadedFile | undefined = req.file
        ? {
            fieldname: req.file.fieldname,
            originalname: req.file.originalname,
            buffer: req.file.buffer,
            mimetype: req.file.mimetype,
            size: req.file.size,
          }
        : undefined;

      const result = await composeMint(
        accountId,
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
// POST /compose/prepare/set — Build action without relaying (for SDK signing)
//
// Same input as /compose/set. Uploads files to Lighthouse and returns the
// built action + target_account so the SDK can sign with the user's key
// and relay via POST /relay/signed (signed_payload auth).
//
// Response:
//   {
//     action:        { type: "set", data: {...} },
//     target_account: "alice.testnet",
//     uploads:       { image: { cid, url, size, hash } }
//   }
// ---------------------------------------------------------------------------
composeRouter.post(
  '/prepare/set',
  upload.any(),
  async (req: Request, res: Response) => {
    const accountId = req.auth!.accountId;

    try {
      const path = req.body.path;
      if (!path || typeof path !== 'string') {
        res.status(400).json({ error: 'Missing required field: path' });
        return;
      }

      let value: Record<string, unknown>;
      if (typeof req.body.value === 'string') {
        try {
          value = JSON.parse(req.body.value);
        } catch {
          res.status(400).json({ error: 'Invalid JSON in value field' });
          return;
        }
      } else if (
        typeof req.body.value === 'object' &&
        req.body.value !== null
      ) {
        value = req.body.value;
      } else {
        value = {};
      }

      const mediaField = req.body.mediaField || undefined;
      const targetAccount = req.body.targetAccount || undefined;

      const files: UploadedFile[] = [];
      if (req.files && Array.isArray(req.files)) {
        for (const f of req.files) {
          files.push({
            fieldname: f.fieldname,
            originalname: f.originalname,
            buffer: f.buffer,
            mimetype: f.mimetype,
            size: f.size,
          });
        }
      }

      const built = await buildSetAction(
        accountId,
        { path, value, mediaField, targetAccount },
        files
      );

      res.status(200).json({
        action: built.action,
        target_account: built.targetAccount,
        uploads: Object.fromEntries(
          Object.entries(built.uploads).map(([k, v]) => [
            k,
            { cid: v.cid, url: v.url, size: v.size, hash: v.hash },
          ])
        ),
      });
    } catch (error) {
      if (error instanceof ComposeError) {
        res.status(error.status).json({ error: error.details });
        return;
      }
      logger.error({ error, accountId }, 'Compose prepare/set failed');
      res.status(500).json({ error: 'Compose prepare/set failed' });
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
composeRouter.post(
  '/prepare/mint',
  upload.single('image'),
  async (req: Request, res: Response) => {
    const accountId = req.auth!.accountId;

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
      } = req.body;

      if (!title || typeof title !== 'string') {
        res.status(400).json({ error: 'Missing required field: title' });
        return;
      }

      let parsedExtra: Record<string, unknown> | undefined;
      if (typeof extra === 'string') {
        try {
          parsedExtra = JSON.parse(extra);
        } catch {
          res.status(400).json({ error: 'Invalid JSON in extra field' });
          return;
        }
      } else if (typeof extra === 'object' && extra !== null) {
        parsedExtra = extra;
      }

      let parsedRoyalty: Record<string, number> | undefined;
      if (typeof royalty === 'string') {
        try {
          parsedRoyalty = JSON.parse(royalty);
        } catch {
          res.status(400).json({ error: 'Invalid JSON in royalty field' });
          return;
        }
      } else if (typeof royalty === 'object' && royalty !== null) {
        parsedRoyalty = royalty;
      }

      const imageFile: UploadedFile | undefined = req.file
        ? {
            fieldname: req.file.fieldname,
            originalname: req.file.originalname,
            buffer: req.file.buffer,
            mimetype: req.file.mimetype,
            size: req.file.size,
          }
        : undefined;

      const built = await buildMintAction(
        accountId,
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
