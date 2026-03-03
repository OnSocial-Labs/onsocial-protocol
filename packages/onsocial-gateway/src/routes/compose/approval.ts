/**
 * Compose routes: NEP-178 Approval management.
 */

import { Router } from 'express';
import { actionHandlers } from './helpers.js';
import {
  buildApproveAction,
  buildRevokeApprovalAction,
  buildRevokeAllApprovalsAction,
} from '../../services/compose/approval.js';

export const approvalRouter = Router();

// ── Approve ─────────────────────────────────────────────────────────────────
const approve = actionHandlers(
  (b) =>
    buildApproveAction({
      tokenId: String(b.tokenId || ''),
      accountId: String(b.accountId || ''),
      msg: b.msg != null ? String(b.msg) : undefined,
      targetAccount: b.targetAccount ? String(b.targetAccount) : undefined,
    }),
  'approve'
);
approvalRouter.post('/approve', approve.relay);
approvalRouter.post('/prepare/approve', approve.prepare);

// ── Revoke Approval ─────────────────────────────────────────────────────────
const revokeApproval = actionHandlers(
  (b) =>
    buildRevokeApprovalAction({
      tokenId: String(b.tokenId || ''),
      accountId: String(b.accountId || ''),
      targetAccount: b.targetAccount ? String(b.targetAccount) : undefined,
    }),
  'revoke-approval'
);
approvalRouter.post('/revoke-approval', revokeApproval.relay);
approvalRouter.post('/prepare/revoke-approval', revokeApproval.prepare);

// ── Revoke All Approvals ────────────────────────────────────────────────────
const revokeAll = actionHandlers(
  (b) =>
    buildRevokeAllApprovalsAction({
      tokenId: String(b.tokenId || ''),
      targetAccount: b.targetAccount ? String(b.targetAccount) : undefined,
    }),
  'revoke-all-approvals'
);
approvalRouter.post('/revoke-all-approvals', revokeAll.relay);
approvalRouter.post('/prepare/revoke-all-approvals', revokeAll.prepare);
