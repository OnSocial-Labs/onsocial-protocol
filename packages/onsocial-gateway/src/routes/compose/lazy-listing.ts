/**
 * Compose routes: Lazy Listing — list content for deferred-mint purchase.
 *
 * POST /prepare/lazy-list                — Upload media + build action; SDK signs.
 * POST /prepare/cancel-lazy-list         — Build cancel action for SDK signing
 * POST /prepare/update-lazy-list-price   — Build update-price action for SDK signing
 * POST /prepare/update-lazy-list-expiry  — Build update-expiry action for SDK signing
 * POST /prepare/purchase-lazy-list       — Build purchase action for SDK signing
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import { logger } from '../../logger.js';
import {
  buildLazyListAction,
  buildCancelLazyListingAction,
  buildUpdateLazyListingPriceAction,
  buildUpdateLazyListingExpiryAction,
  buildPurchaseLazyListingAction,
  ComposeError,
} from '../../services/compose/index.js';
import {
  parseJsonField,
  parseBool,
  extractImageFile,
  resolveActorId,
} from './helpers.js';

export const lazyListingRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 1024, files: 50 },
});

// ---------------------------------------------------------------------------
// POST /compose/prepare/lazy-list — Build lazy-list action without relaying
// ---------------------------------------------------------------------------
lazyListingRouter.post(
  '/prepare/lazy-list',
  upload.single('image'),
  async (req: Request, res: Response) => {
    const effectiveActorId = resolveActorId(req);

    try {
      const {
        title,
        description,
        priceNear,
        extra,
        mediaCid,
        mediaHash,
        royalty,
        appId,
        transferable,
        burnable,
        expiresAt,
        targetAccount,
        skipAutoMedia,
        creator,
        cardBg,
        cardFont,
        cardMarkColor,
        cardMarkShape,
        cardTitleAlign,
      } = req.body;

      if (!title || typeof title !== 'string') {
        res.status(400).json({ error: 'Missing required field: title' });
        return;
      }
      if (!priceNear || typeof priceNear !== 'string') {
        res.status(400).json({ error: 'Missing required field: priceNear' });
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

      const built = await buildLazyListAction(
        effectiveActorId,
        {
          title,
          priceNear,
          ...(description && { description }),
          ...(parsedExtra && { extra: parsedExtra }),
          ...(mediaCid && { mediaCid }),
          ...(mediaHash && { mediaHash }),
          ...(parsedRoyalty && { royalty: parsedRoyalty }),
          ...(appId && { appId }),
          ...(parseBool(transferable) != null && {
            transferable: parseBool(transferable)!,
          }),
          ...(parseBool(burnable) != null && {
            burnable: parseBool(burnable)!,
          }),
          ...(expiresAt && { expiresAt: parseInt(expiresAt, 10) }),
          ...(targetAccount && { targetAccount }),
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
        'Compose prepare/lazy-list failed'
      );
      res.status(500).json({ error: 'Compose prepare/lazy-list failed' });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /compose/prepare/cancel-lazy-list — Build cancel action for SDK signing
//   JSON body: { listingId: string, targetAccount?: string }
// ---------------------------------------------------------------------------
lazyListingRouter.post(
  '/prepare/cancel-lazy-list',
  async (req: Request, res: Response) => {
    try {
      const { listingId, targetAccount } = req.body;
      if (!listingId || typeof listingId !== 'string') {
        res.status(400).json({ error: 'Missing required field: listingId' });
        return;
      }

      const built = buildCancelLazyListingAction(listingId, targetAccount);
      res.status(200).json({
        action: built.action,
        target_account: built.targetAccount,
      });
    } catch (error) {
      if (error instanceof ComposeError) {
        res.status(error.status).json({ error: error.details });
        return;
      }
      logger.error(
        { error, accountId: req.auth?.accountId },
        'Compose prepare/cancel-lazy-list failed'
      );
      res
        .status(500)
        .json({ error: 'Compose prepare/cancel-lazy-list failed' });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /compose/prepare/update-lazy-list-price — Build update-price action
//   JSON body: { listingId: string, newPriceNear: string, targetAccount?: string }
// ---------------------------------------------------------------------------
lazyListingRouter.post(
  '/prepare/update-lazy-list-price',
  async (req: Request, res: Response) => {
    try {
      const { listingId, newPriceNear, targetAccount } = req.body;
      if (!listingId || typeof listingId !== 'string') {
        res.status(400).json({ error: 'Missing required field: listingId' });
        return;
      }
      if (!newPriceNear || typeof newPriceNear !== 'string') {
        res.status(400).json({ error: 'Missing required field: newPriceNear' });
        return;
      }

      const built = buildUpdateLazyListingPriceAction(
        listingId,
        newPriceNear,
        targetAccount
      );
      res.status(200).json({
        action: built.action,
        target_account: built.targetAccount,
      });
    } catch (error) {
      if (error instanceof ComposeError) {
        res.status(error.status).json({ error: error.details });
        return;
      }
      logger.error(
        { error, accountId: req.auth?.accountId },
        'Compose prepare/update-lazy-list-price failed'
      );
      res
        .status(500)
        .json({ error: 'Compose prepare/update-lazy-list-price failed' });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /compose/prepare/update-lazy-list-expiry — Build update-expiry action
//   JSON body: { listingId: string, newExpiresAt: number | null, targetAccount?: string }
// ---------------------------------------------------------------------------
lazyListingRouter.post(
  '/prepare/update-lazy-list-expiry',
  async (req: Request, res: Response) => {
    try {
      const { listingId, newExpiresAt, targetAccount } = req.body;
      if (!listingId || typeof listingId !== 'string') {
        res.status(400).json({ error: 'Missing required field: listingId' });
        return;
      }

      const built = buildUpdateLazyListingExpiryAction(
        listingId,
        newExpiresAt ?? null,
        targetAccount
      );
      res.status(200).json({
        action: built.action,
        target_account: built.targetAccount,
      });
    } catch (error) {
      if (error instanceof ComposeError) {
        res.status(error.status).json({ error: error.details });
        return;
      }
      logger.error(
        { error, accountId: req.auth?.accountId },
        'Compose prepare/update-lazy-list-expiry failed'
      );
      res
        .status(500)
        .json({ error: 'Compose prepare/update-lazy-list-expiry failed' });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /compose/prepare/purchase-lazy-list — Build purchase action for SDK signing
//   JSON body: { listingId: string, targetAccount?: string }
//
// Note: the buyer must attach NEAR equal to the listing price when signing.
// The action returned here has the contract + method info for the SDK.
// ---------------------------------------------------------------------------
lazyListingRouter.post(
  '/prepare/purchase-lazy-list',
  async (req: Request, res: Response) => {
    try {
      const { listingId, targetAccount } = req.body;
      if (!listingId || typeof listingId !== 'string') {
        res.status(400).json({ error: 'Missing required field: listingId' });
        return;
      }

      const built = buildPurchaseLazyListingAction(listingId, targetAccount);
      res.status(200).json({
        action: built.action,
        target_account: built.targetAccount,
      });
    } catch (error) {
      if (error instanceof ComposeError) {
        res.status(error.status).json({ error: error.details });
        return;
      }
      logger.error(
        { error, accountId: req.auth?.accountId },
        'Compose prepare/purchase-lazy-list failed'
      );
      res
        .status(500)
        .json({ error: 'Compose prepare/purchase-lazy-list failed' });
    }
  }
);
