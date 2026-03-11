/**
 * Compose routes: Collection management — pricing, timing, minting, airdrop,
 * pause/resume, allowlists, metadata, cancellation, refunds, purchases.
 */

import { Router } from 'express';
import { actionHandlers, parseJsonField } from './helpers.js';
import {
  buildUpdateCollectionPriceAction,
  buildUpdateCollectionTimingAction,
  buildMintFromCollectionAction,
  buildAirdropFromCollectionAction,
  buildPurchaseFromCollectionAction,
  buildPauseCollectionAction,
  buildResumeCollectionAction,
  buildDeleteCollectionAction,
  buildCancelCollectionAction,
  buildWithdrawUnclaimedRefundsAction,
  buildSetAllowlistAction,
  buildRemoveFromAllowlistAction,
  buildSetCollectionMetadataAction,
  buildSetCollectionAppMetadataAction,
} from '../../services/compose/collection-manage.js';

export const collectionManageRouter = Router();

// ── Update Collection Price ─────────────────────────────────────────────────
const updatePrice = actionHandlers(
  (b) =>
    buildUpdateCollectionPriceAction({
      collectionId: String(b.collectionId || ''),
      newPriceNear: String(b.newPriceNear || ''),
      targetAccount: b.targetAccount ? String(b.targetAccount) : undefined,
    }),
  'update-collection-price'
);
collectionManageRouter.post('/update-collection-price', updatePrice.relay);
collectionManageRouter.post(
  '/prepare/update-collection-price',
  updatePrice.prepare
);

// ── Update Collection Timing ────────────────────────────────────────────────
const updateTiming = actionHandlers(
  (b) =>
    buildUpdateCollectionTimingAction({
      collectionId: String(b.collectionId || ''),
      startTime: b.startTime != null ? Number(b.startTime) : undefined,
      endTime: b.endTime != null ? Number(b.endTime) : undefined,
      targetAccount: b.targetAccount ? String(b.targetAccount) : undefined,
    }),
  'update-collection-timing'
);
collectionManageRouter.post('/update-collection-timing', updateTiming.relay);
collectionManageRouter.post(
  '/prepare/update-collection-timing',
  updateTiming.prepare
);

// ── Mint from Collection ────────────────────────────────────────────────────
const mintFromCol = actionHandlers(
  (b) =>
    buildMintFromCollectionAction({
      collectionId: String(b.collectionId || ''),
      quantity: Number(b.quantity ?? 1),
      receiverId: b.receiverId ? String(b.receiverId) : undefined,
      targetAccount: b.targetAccount ? String(b.targetAccount) : undefined,
    }),
  'mint-from-collection'
);
collectionManageRouter.post('/mint-from-collection', mintFromCol.relay);
collectionManageRouter.post(
  '/prepare/mint-from-collection',
  mintFromCol.prepare
);

// ── Airdrop from Collection ─────────────────────────────────────────────────
const airdrop = actionHandlers(
  (b) =>
    buildAirdropFromCollectionAction({
      collectionId: String(b.collectionId || ''),
      receivers: b.receivers as string[],
      targetAccount: b.targetAccount ? String(b.targetAccount) : undefined,
    }),
  'airdrop-from-collection'
);
collectionManageRouter.post('/airdrop-from-collection', airdrop.relay);
collectionManageRouter.post(
  '/prepare/airdrop-from-collection',
  airdrop.prepare
);

// ── Purchase from Collection ────────────────────────────────────────────────
const purchaseCol = actionHandlers(
  (b) =>
    buildPurchaseFromCollectionAction({
      collectionId: String(b.collectionId || ''),
      quantity: Number(b.quantity ?? 1),
      maxPricePerTokenNear: String(b.maxPricePerTokenNear || ''),
      targetAccount: b.targetAccount ? String(b.targetAccount) : undefined,
    }),
  'purchase-from-collection'
);
collectionManageRouter.post('/purchase-from-collection', purchaseCol.relay);
collectionManageRouter.post(
  '/prepare/purchase-from-collection',
  purchaseCol.prepare
);

// ── Pause Collection ────────────────────────────────────────────────────────
const pause = actionHandlers(
  (b) =>
    buildPauseCollectionAction({
      collectionId: String(b.collectionId || ''),
      targetAccount: b.targetAccount ? String(b.targetAccount) : undefined,
    }),
  'pause-collection'
);
collectionManageRouter.post('/pause-collection', pause.relay);
collectionManageRouter.post('/prepare/pause-collection', pause.prepare);

// ── Resume Collection ───────────────────────────────────────────────────────
const resume = actionHandlers(
  (b) =>
    buildResumeCollectionAction({
      collectionId: String(b.collectionId || ''),
      targetAccount: b.targetAccount ? String(b.targetAccount) : undefined,
    }),
  'resume-collection'
);
collectionManageRouter.post('/resume-collection', resume.relay);
collectionManageRouter.post('/prepare/resume-collection', resume.prepare);

// ── Delete Collection ───────────────────────────────────────────────────────
const del = actionHandlers(
  (b) =>
    buildDeleteCollectionAction({
      collectionId: String(b.collectionId || ''),
      targetAccount: b.targetAccount ? String(b.targetAccount) : undefined,
    }),
  'delete-collection'
);
collectionManageRouter.post('/delete-collection', del.relay);
collectionManageRouter.post('/prepare/delete-collection', del.prepare);

// ── Cancel Collection ───────────────────────────────────────────────────────
const cancel = actionHandlers(
  (b) =>
    buildCancelCollectionAction({
      collectionId: String(b.collectionId || ''),
      refundPerTokenNear: String(b.refundPerTokenNear || ''),
      refundDeadlineNs:
        b.refundDeadlineNs != null ? Number(b.refundDeadlineNs) : undefined,
      targetAccount: b.targetAccount ? String(b.targetAccount) : undefined,
    }),
  'cancel-collection'
);
collectionManageRouter.post('/cancel-collection', cancel.relay);
collectionManageRouter.post('/prepare/cancel-collection', cancel.prepare);

// ── Withdraw Unclaimed Refunds ──────────────────────────────────────────────
const withdrawRefunds = actionHandlers(
  (b) =>
    buildWithdrawUnclaimedRefundsAction({
      collectionId: String(b.collectionId || ''),
      targetAccount: b.targetAccount ? String(b.targetAccount) : undefined,
    }),
  'withdraw-unclaimed-refunds'
);
collectionManageRouter.post(
  '/withdraw-unclaimed-refunds',
  withdrawRefunds.relay
);
collectionManageRouter.post(
  '/prepare/withdraw-unclaimed-refunds',
  withdrawRefunds.prepare
);

// ── Set Allowlist ───────────────────────────────────────────────────────────
const setAl = actionHandlers(
  (b) =>
    buildSetAllowlistAction({
      collectionId: String(b.collectionId || ''),
      entries: (parseJsonField(b.entries) ?? b.entries) as Array<{
        account_id: string;
        allocation: number;
      }>,
      targetAccount: b.targetAccount ? String(b.targetAccount) : undefined,
    }),
  'set-allowlist'
);
collectionManageRouter.post('/set-allowlist', setAl.relay);
collectionManageRouter.post('/prepare/set-allowlist', setAl.prepare);

// ── Remove from Allowlist ───────────────────────────────────────────────────
const removeAl = actionHandlers(
  (b) =>
    buildRemoveFromAllowlistAction({
      collectionId: String(b.collectionId || ''),
      accounts: (parseJsonField(b.accounts) ?? b.accounts) as string[],
      targetAccount: b.targetAccount ? String(b.targetAccount) : undefined,
    }),
  'remove-from-allowlist'
);
collectionManageRouter.post('/remove-from-allowlist', removeAl.relay);
collectionManageRouter.post('/prepare/remove-from-allowlist', removeAl.prepare);

// ── Set Collection Metadata ─────────────────────────────────────────────────
const setMeta = actionHandlers(
  (b) =>
    buildSetCollectionMetadataAction({
      collectionId: String(b.collectionId || ''),
      metadata: b.metadata != null ? String(b.metadata) : null,
      targetAccount: b.targetAccount ? String(b.targetAccount) : undefined,
    }),
  'set-collection-metadata'
);
collectionManageRouter.post('/set-collection-metadata', setMeta.relay);
collectionManageRouter.post(
  '/prepare/set-collection-metadata',
  setMeta.prepare
);

// ── Set Collection App Metadata ─────────────────────────────────────────────
const setAppMeta = actionHandlers(
  (b) =>
    buildSetCollectionAppMetadataAction({
      appId: String(b.appId || ''),
      collectionId: String(b.collectionId || ''),
      metadata: b.metadata != null ? String(b.metadata) : null,
      targetAccount: b.targetAccount ? String(b.targetAccount) : undefined,
    }),
  'set-collection-app-metadata'
);
collectionManageRouter.post('/set-collection-app-metadata', setAppMeta.relay);
collectionManageRouter.post(
  '/prepare/set-collection-app-metadata',
  setAppMeta.prepare
);
