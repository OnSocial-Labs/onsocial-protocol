/**
 * Tests for NEP-178 approval builders.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import './helpers.js';
import {
  buildApproveAction,
  buildRevokeApprovalAction,
  buildRevokeAllApprovalsAction,
  ComposeError,
} from '../../../src/services/compose/index.js';

beforeEach(() => vi.clearAllMocks());

describe('buildApproveAction', () => {
  it('builds a valid approve action', () => {
    const result = buildApproveAction({
      tokenId: 's:1',
      accountId: 'marketplace.near',
    });
    expect(result.action).toEqual({
      type: 'approve_scarce',
      token_id: 's:1',
      account_id: 'marketplace.near',
    });
  });

  it('includes optional msg', () => {
    const result = buildApproveAction({
      tokenId: 's:1',
      accountId: 'marketplace.near',
      msg: '{"price":"1000000000000000000000000"}',
    });
    expect(result.action).toHaveProperty('msg');
  });

  it('throws on missing tokenId', () => {
    expect(() =>
      buildApproveAction({ tokenId: '', accountId: 'marketplace.near' })
    ).toThrow(ComposeError);
  });

  it('throws on missing accountId', () => {
    expect(() => buildApproveAction({ tokenId: 's:1', accountId: '' })).toThrow(
      ComposeError
    );
  });
});

describe('buildRevokeApprovalAction', () => {
  it('builds a valid revoke approval action', () => {
    const result = buildRevokeApprovalAction({
      tokenId: 's:1',
      accountId: 'marketplace.near',
    });
    expect(result.action).toEqual({
      type: 'revoke_scarce',
      token_id: 's:1',
      account_id: 'marketplace.near',
    });
  });

  it('throws on missing accountId', () => {
    expect(() =>
      buildRevokeApprovalAction({ tokenId: 's:1', accountId: '' })
    ).toThrow(ComposeError);
  });
});

describe('buildRevokeAllApprovalsAction', () => {
  it('builds a valid revoke-all action', () => {
    const result = buildRevokeAllApprovalsAction({ tokenId: 's:1' });
    expect(result.action).toEqual({
      type: 'revoke_all_scarce',
      token_id: 's:1',
    });
  });

  it('throws on missing tokenId', () => {
    expect(() => buildRevokeAllApprovalsAction({ tokenId: '' })).toThrow(
      ComposeError
    );
  });
});
