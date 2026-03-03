/**
 * Tests for app management builders — registration, config, pools,
 * moderation, storage, spending caps.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import './helpers.js';
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
  ComposeError,
} from '../../../src/services/compose/index.js';

beforeEach(() => vi.clearAllMocks());

// ── Registration ────────────────────────────────────────────────────────────
describe('buildRegisterAppAction', () => {
  it('builds a minimal register action', () => {
    const result = buildRegisterAppAction({ appId: 'tickets.near' });
    expect(result.action).toEqual({
      type: 'register_app',
      app_id: 'tickets.near',
    });
    expect(result.targetAccount).toBe('scarces.onsocial.testnet');
  });

  it('includes all optional config fields', () => {
    const result = buildRegisterAppAction({
      appId: 'tickets.near',
      maxUserBytes: 50000,
      defaultRoyalty: { 'creator.near': 1000 },
      primarySaleBps: 500,
      curated: true,
      metadata: '{"name":"Tickets"}',
    });
    expect(result.action).toHaveProperty('max_user_bytes', 50000);
    expect(result.action).toHaveProperty('default_royalty', {
      'creator.near': 1000,
    });
    expect(result.action).toHaveProperty('primary_sale_bps', 500);
    expect(result.action).toHaveProperty('curated', true);
    expect(result.action).toHaveProperty('metadata', '{"name":"Tickets"}');
  });

  it('throws on missing appId', () => {
    expect(() => buildRegisterAppAction({ appId: '' })).toThrow(ComposeError);
  });

  it('validates royalty', () => {
    expect(() =>
      buildRegisterAppAction({
        appId: 'tickets.near',
        defaultRoyalty: { a: 6000 },
      })
    ).toThrow(ComposeError);
  });

  it('rejects primarySaleBps > 5000', () => {
    expect(() =>
      buildRegisterAppAction({
        appId: 'tickets.near',
        primarySaleBps: 6000,
      })
    ).toThrow(ComposeError);
  });
});

// ── Config ──────────────────────────────────────────────────────────────────
describe('buildSetAppConfigAction', () => {
  it('builds a config update action', () => {
    const result = buildSetAppConfigAction({
      appId: 'tickets.near',
      primarySaleBps: 300,
    });
    expect(result.action).toEqual({
      type: 'set_app_config',
      app_id: 'tickets.near',
      primary_sale_bps: 300,
    });
  });
});

// ── Pool ────────────────────────────────────────────────────────────────────
describe('buildFundAppPoolAction', () => {
  it('builds a fund action', () => {
    const result = buildFundAppPoolAction({ appId: 'tickets.near' });
    expect(result.action).toEqual({
      type: 'fund_app_pool',
      app_id: 'tickets.near',
    });
  });
});

describe('buildWithdrawAppPoolAction', () => {
  it('builds a withdraw action with yoctoNEAR', () => {
    const result = buildWithdrawAppPoolAction({
      appId: 'tickets.near',
      amountNear: '10',
    });
    expect(result.action).toEqual({
      type: 'withdraw_app_pool',
      app_id: 'tickets.near',
      amount: '10000000000000000000000000',
    });
  });

  it('throws on missing amountNear', () => {
    expect(() =>
      buildWithdrawAppPoolAction({ appId: 'tickets.near', amountNear: '' })
    ).toThrow(ComposeError);
  });
});

// ── Ownership & Moderation ──────────────────────────────────────────────────
describe('buildTransferAppOwnershipAction', () => {
  it('builds a valid transfer ownership action', () => {
    const result = buildTransferAppOwnershipAction({
      appId: 'tickets.near',
      newOwner: 'newadmin.near',
    });
    expect(result.action).toEqual({
      type: 'transfer_app_ownership',
      app_id: 'tickets.near',
      new_owner: 'newadmin.near',
    });
  });

  it('throws on missing newOwner', () => {
    expect(() =>
      buildTransferAppOwnershipAction({
        appId: 'tickets.near',
        newOwner: '',
      })
    ).toThrow(ComposeError);
  });
});

describe('buildAddModeratorAction', () => {
  it('builds a valid add-moderator action', () => {
    const result = buildAddModeratorAction({
      appId: 'tickets.near',
      accountId: 'mod.near',
    });
    expect(result.action).toEqual({
      type: 'add_moderator',
      app_id: 'tickets.near',
      account_id: 'mod.near',
    });
  });
});

describe('buildRemoveModeratorAction', () => {
  it('builds a valid remove-moderator action', () => {
    const result = buildRemoveModeratorAction({
      appId: 'tickets.near',
      accountId: 'mod.near',
    });
    expect(result.action).toEqual({
      type: 'remove_moderator',
      app_id: 'tickets.near',
      account_id: 'mod.near',
    });
  });
});

describe('buildBanCollectionAction', () => {
  it('builds a ban action with optional reason', () => {
    const result = buildBanCollectionAction({
      appId: 'tickets.near',
      collectionId: 'scam-drop',
      reason: 'Fraudulent',
    });
    expect(result.action).toEqual({
      type: 'ban_collection',
      app_id: 'tickets.near',
      collection_id: 'scam-drop',
      reason: 'Fraudulent',
    });
  });

  it('omits reason when not provided', () => {
    const result = buildBanCollectionAction({
      appId: 'tickets.near',
      collectionId: 'scam-drop',
    });
    expect(result.action).not.toHaveProperty('reason');
  });
});

describe('buildUnbanCollectionAction', () => {
  it('builds a valid unban action', () => {
    const result = buildUnbanCollectionAction({
      appId: 'tickets.near',
      collectionId: 'restored',
    });
    expect(result.action).toEqual({
      type: 'unban_collection',
      app_id: 'tickets.near',
      collection_id: 'restored',
    });
  });
});

// ── Storage & Admin ─────────────────────────────────────────────────────────
describe('buildStorageDepositAction', () => {
  it('builds action without accountId', () => {
    const result = buildStorageDepositAction({});
    expect(result.action).toEqual({ type: 'storage_deposit' });
  });

  it('builds action with accountId', () => {
    const result = buildStorageDepositAction({ accountId: 'alice.near' });
    expect(result.action).toEqual({
      type: 'storage_deposit',
      account_id: 'alice.near',
    });
  });
});

describe('buildStorageWithdrawAction', () => {
  it('builds a valid storage withdraw action', () => {
    const result = buildStorageWithdrawAction({});
    expect(result.action).toEqual({ type: 'storage_withdraw' });
  });
});

describe('buildWithdrawPlatformStorageAction', () => {
  it('builds with yoctoNEAR amount', () => {
    const result = buildWithdrawPlatformStorageAction({ amountNear: '100' });
    expect(result.action).toEqual({
      type: 'withdraw_platform_storage',
      amount: '100000000000000000000000000',
    });
  });

  it('throws on missing amountNear', () => {
    expect(() =>
      buildWithdrawPlatformStorageAction({ amountNear: '' })
    ).toThrow(ComposeError);
  });
});

describe('buildSetSpendingCapAction', () => {
  it('builds action with cap', () => {
    const result = buildSetSpendingCapAction({ capNear: '50' });
    expect(result.action).toEqual({
      type: 'set_spending_cap',
      cap: '50000000000000000000000000',
    });
  });

  it('builds action with null cap (remove cap)', () => {
    const result = buildSetSpendingCapAction({ capNear: null });
    expect(result.action).toEqual({
      type: 'set_spending_cap',
      cap: null,
    });
  });
});
