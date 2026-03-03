/**
 * Tests for token lifecycle builders: transfer, batch transfer, burn,
 * renew, redeem, revoke, claim refund.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import './helpers.js';
import {
  buildTransferAction,
  buildBatchTransferAction,
  buildBurnAction,
  buildRenewTokenAction,
  buildRedeemTokenAction,
  buildRevokeTokenAction,
  buildClaimRefundAction,
  ComposeError,
} from '../../../src/services/compose/index.js';

beforeEach(() => vi.clearAllMocks());

// ── Transfer ────────────────────────────────────────────────────────────────
describe('buildTransferAction', () => {
  it('builds a valid transfer action', () => {
    const result = buildTransferAction({
      tokenId: 's:1',
      receiverId: 'bob.near',
    });
    expect(result.action).toEqual({
      type: 'transfer_scarce',
      token_id: 's:1',
      receiver_id: 'bob.near',
    });
    expect(result.targetAccount).toBe('scarces.onsocial.testnet');
  });

  it('includes optional memo', () => {
    const result = buildTransferAction({
      tokenId: 's:1',
      receiverId: 'bob.near',
      memo: 'gift',
    });
    expect(result.action).toHaveProperty('memo', 'gift');
  });

  it('throws on missing tokenId', () => {
    expect(() =>
      buildTransferAction({ tokenId: '', receiverId: 'bob.near' })
    ).toThrow(ComposeError);
  });

  it('throws on missing receiverId', () => {
    expect(() =>
      buildTransferAction({ tokenId: 's:1', receiverId: '' })
    ).toThrow(ComposeError);
  });
});

// ── Batch Transfer ──────────────────────────────────────────────────────────
describe('buildBatchTransferAction', () => {
  it('builds a valid batch transfer', () => {
    const result = buildBatchTransferAction({
      transfers: [
        { token_id: 's:1', receiver_id: 'alice.near' },
        { token_id: 's:2', receiver_id: 'bob.near', memo: 'hi' },
      ],
    });
    expect(result.action).toEqual({
      type: 'batch_transfer',
      transfers: [
        { token_id: 's:1', receiver_id: 'alice.near' },
        { token_id: 's:2', receiver_id: 'bob.near', memo: 'hi' },
      ],
    });
  });

  it('throws on empty transfers', () => {
    expect(() => buildBatchTransferAction({ transfers: [] })).toThrow(
      ComposeError
    );
  });

  it('throws on missing token_id in transfer', () => {
    expect(() =>
      buildBatchTransferAction({
        transfers: [{ token_id: '', receiver_id: 'bob.near' }],
      })
    ).toThrow(ComposeError);
  });
});

// ── Burn ────────────────────────────────────────────────────────────────────
describe('buildBurnAction', () => {
  it('builds a valid burn action', () => {
    const result = buildBurnAction({ tokenId: 's:1' });
    expect(result.action).toEqual({ type: 'burn_scarce', token_id: 's:1' });
  });

  it('includes optional collectionId', () => {
    const result = buildBurnAction({
      tokenId: 's:1',
      collectionId: 'art',
    });
    expect(result.action).toHaveProperty('collection_id', 'art');
  });

  it('throws on missing tokenId', () => {
    expect(() => buildBurnAction({ tokenId: '' })).toThrow(ComposeError);
  });
});

// ── Renew Token ─────────────────────────────────────────────────────────────
describe('buildRenewTokenAction', () => {
  it('builds a valid renew action', () => {
    const result = buildRenewTokenAction({
      tokenId: 's:1',
      collectionId: 'membership',
      newExpiresAt: 1700000000000,
    });
    expect(result.action).toEqual({
      type: 'renew_token',
      token_id: 's:1',
      collection_id: 'membership',
      new_expires_at: 1700000000000,
    });
  });

  it('throws on missing collectionId', () => {
    expect(() =>
      buildRenewTokenAction({
        tokenId: 's:1',
        collectionId: '',
        newExpiresAt: 1700000000000,
      })
    ).toThrow(ComposeError);
  });
});

// ── Redeem Token ────────────────────────────────────────────────────────────
describe('buildRedeemTokenAction', () => {
  it('builds a valid redeem action', () => {
    const result = buildRedeemTokenAction({
      tokenId: 's:1',
      collectionId: 'concert-2026',
    });
    expect(result.action).toEqual({
      type: 'redeem_token',
      token_id: 's:1',
      collection_id: 'concert-2026',
    });
  });

  it('throws on missing tokenId', () => {
    expect(() =>
      buildRedeemTokenAction({ tokenId: '', collectionId: 'c1' })
    ).toThrow(ComposeError);
  });
});

// ── Revoke Token ────────────────────────────────────────────────────────────
describe('buildRevokeTokenAction', () => {
  it('builds a valid revoke action', () => {
    const result = buildRevokeTokenAction({
      tokenId: 's:1',
      collectionId: 'certs',
      memo: 'Cheating detected',
    });
    expect(result.action).toEqual({
      type: 'revoke_token',
      token_id: 's:1',
      collection_id: 'certs',
      memo: 'Cheating detected',
    });
  });

  it('omits memo when not provided', () => {
    const result = buildRevokeTokenAction({
      tokenId: 's:1',
      collectionId: 'certs',
    });
    expect(result.action).not.toHaveProperty('memo');
  });
});

// ── Claim Refund ────────────────────────────────────────────────────────────
describe('buildClaimRefundAction', () => {
  it('builds a valid claim refund action', () => {
    const result = buildClaimRefundAction({
      tokenId: 's:1',
      collectionId: 'cancelled-event',
    });
    expect(result.action).toEqual({
      type: 'claim_refund',
      token_id: 's:1',
      collection_id: 'cancelled-event',
    });
  });

  it('throws on missing collectionId', () => {
    expect(() =>
      buildClaimRefundAction({ tokenId: 's:1', collectionId: '' })
    ).toThrow(ComposeError);
  });
});
