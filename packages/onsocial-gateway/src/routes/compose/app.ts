/**
 * Compose routes: App management — register, config, pool, moderators,
 * moderation, storage, and spending caps.
 */

import { Router } from 'express';
import { actionHandlers, parseJsonField } from './helpers.js';
import {
  buildRegisterAppAction,
  buildSetAppConfigAction,
  buildFundAppPoolAction,
  buildWithdrawAppPoolAction,
  buildTransferAppOwnershipAction,
  buildAddModeratorAction,
  buildRemoveModeratorAction,
  buildBanCollectionAction,
  buildUnbanCollectionAction,
  buildStorageDepositAction,
  buildStorageWithdrawAction,
  buildWithdrawPlatformStorageAction,
  buildSetSpendingCapAction,
} from '../../services/compose/app.js';

export const appRouter = Router();

// ── Register App ────────────────────────────────────────────────────────────
const register = actionHandlers(
  (b) =>
    buildRegisterAppAction({
      appId: String(b.appId || ''),
      maxUserBytes: b.maxUserBytes != null ? Number(b.maxUserBytes) : undefined,
      defaultRoyalty: parseJsonField<Record<string, number>>(b.defaultRoyalty),
      primarySaleBps:
        b.primarySaleBps != null ? Number(b.primarySaleBps) : undefined,
      curated: b.curated != null ? Boolean(b.curated) : undefined,
      metadata: b.metadata != null ? String(b.metadata) : undefined,
      targetAccount: b.targetAccount ? String(b.targetAccount) : undefined,
    }),
  'register-app'
);
appRouter.post('/register-app', register.relay);
appRouter.post('/prepare/register-app', register.prepare);

// ── Set App Config ──────────────────────────────────────────────────────────
const setConfig = actionHandlers(
  (b) =>
    buildSetAppConfigAction({
      appId: String(b.appId || ''),
      maxUserBytes: b.maxUserBytes != null ? Number(b.maxUserBytes) : undefined,
      defaultRoyalty: parseJsonField<Record<string, number>>(b.defaultRoyalty),
      primarySaleBps:
        b.primarySaleBps != null ? Number(b.primarySaleBps) : undefined,
      curated: b.curated != null ? Boolean(b.curated) : undefined,
      metadata: b.metadata != null ? String(b.metadata) : undefined,
      targetAccount: b.targetAccount ? String(b.targetAccount) : undefined,
    }),
  'set-app-config'
);
appRouter.post('/set-app-config', setConfig.relay);
appRouter.post('/prepare/set-app-config', setConfig.prepare);

// ── Fund App Pool ───────────────────────────────────────────────────────────
const fund = actionHandlers(
  (b) =>
    buildFundAppPoolAction({
      appId: String(b.appId || ''),
      targetAccount: b.targetAccount ? String(b.targetAccount) : undefined,
    }),
  'fund-app-pool'
);
appRouter.post('/fund-app-pool', fund.relay);
appRouter.post('/prepare/fund-app-pool', fund.prepare);

// ── Withdraw App Pool ───────────────────────────────────────────────────────
const withdraw = actionHandlers(
  (b) =>
    buildWithdrawAppPoolAction({
      appId: String(b.appId || ''),
      amountNear: String(b.amountNear || ''),
      targetAccount: b.targetAccount ? String(b.targetAccount) : undefined,
    }),
  'withdraw-app-pool'
);
appRouter.post('/withdraw-app-pool', withdraw.relay);
appRouter.post('/prepare/withdraw-app-pool', withdraw.prepare);

// ── Transfer App Ownership ──────────────────────────────────────────────────
const transferOwn = actionHandlers(
  (b) =>
    buildTransferAppOwnershipAction({
      appId: String(b.appId || ''),
      newOwner: String(b.newOwner || ''),
      targetAccount: b.targetAccount ? String(b.targetAccount) : undefined,
    }),
  'transfer-app-ownership'
);
appRouter.post('/transfer-app-ownership', transferOwn.relay);
appRouter.post('/prepare/transfer-app-ownership', transferOwn.prepare);

// ── Add Moderator ───────────────────────────────────────────────────────────
const addMod = actionHandlers(
  (b) =>
    buildAddModeratorAction({
      appId: String(b.appId || ''),
      accountId: String(b.accountId || ''),
      targetAccount: b.targetAccount ? String(b.targetAccount) : undefined,
    }),
  'add-moderator'
);
appRouter.post('/add-moderator', addMod.relay);
appRouter.post('/prepare/add-moderator', addMod.prepare);

// ── Remove Moderator ────────────────────────────────────────────────────────
const removeMod = actionHandlers(
  (b) =>
    buildRemoveModeratorAction({
      appId: String(b.appId || ''),
      accountId: String(b.accountId || ''),
      targetAccount: b.targetAccount ? String(b.targetAccount) : undefined,
    }),
  'remove-moderator'
);
appRouter.post('/remove-moderator', removeMod.relay);
appRouter.post('/prepare/remove-moderator', removeMod.prepare);

// ── Ban Collection ──────────────────────────────────────────────────────────
const ban = actionHandlers(
  (b) =>
    buildBanCollectionAction({
      appId: String(b.appId || ''),
      collectionId: String(b.collectionId || ''),
      reason: b.reason ? String(b.reason) : undefined,
      targetAccount: b.targetAccount ? String(b.targetAccount) : undefined,
    }),
  'ban-collection'
);
appRouter.post('/ban-collection', ban.relay);
appRouter.post('/prepare/ban-collection', ban.prepare);

// ── Unban Collection ────────────────────────────────────────────────────────
const unban = actionHandlers(
  (b) =>
    buildUnbanCollectionAction({
      appId: String(b.appId || ''),
      collectionId: String(b.collectionId || ''),
      targetAccount: b.targetAccount ? String(b.targetAccount) : undefined,
    }),
  'unban-collection'
);
appRouter.post('/unban-collection', unban.relay);
appRouter.post('/prepare/unban-collection', unban.prepare);

// ── Storage Deposit ─────────────────────────────────────────────────────────
const storageDep = actionHandlers(
  (b) =>
    buildStorageDepositAction({
      accountId: b.accountId ? String(b.accountId) : undefined,
      targetAccount: b.targetAccount ? String(b.targetAccount) : undefined,
    }),
  'storage-deposit'
);
appRouter.post('/storage-deposit', storageDep.relay);
appRouter.post('/prepare/storage-deposit', storageDep.prepare);

// ── Storage Withdraw ────────────────────────────────────────────────────────
const storageWith = actionHandlers(
  (b) =>
    buildStorageWithdrawAction({
      targetAccount: b.targetAccount ? String(b.targetAccount) : undefined,
    }),
  'storage-withdraw'
);
appRouter.post('/storage-withdraw', storageWith.relay);
appRouter.post('/prepare/storage-withdraw', storageWith.prepare);

// ── Withdraw Platform Storage ───────────────────────────────────────────────
const platWith = actionHandlers(
  (b) =>
    buildWithdrawPlatformStorageAction({
      amountNear: String(b.amountNear || ''),
      targetAccount: b.targetAccount ? String(b.targetAccount) : undefined,
    }),
  'withdraw-platform-storage'
);
appRouter.post('/withdraw-platform-storage', platWith.relay);
appRouter.post('/prepare/withdraw-platform-storage', platWith.prepare);

// ── Set Spending Cap ────────────────────────────────────────────────────────
const cap = actionHandlers(
  (b) =>
    buildSetSpendingCapAction({
      capNear: b.capNear != null ? String(b.capNear) : null,
      targetAccount: b.targetAccount ? String(b.targetAccount) : undefined,
    }),
  'set-spending-cap'
);
appRouter.post('/set-spending-cap', cap.relay);
appRouter.post('/prepare/set-spending-cap', cap.prepare);
