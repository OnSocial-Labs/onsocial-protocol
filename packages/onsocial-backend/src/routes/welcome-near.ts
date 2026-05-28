import { Router } from 'express';
import type { Request, Response } from 'express';
import { config } from '../config/index.js';
import { pool, query } from '../db/index.js';
import { logger } from '../logger.js';
import { partnerAuth } from '../middleware/partnerAuth.js';
import { relayWelcomeNearTransfer } from '../services/welcome-near-relay.js';
import {
  accountNeedsWelcomeNear,
  buildWelcomeNearChallenge,
  verifyWelcomeNearAuth,
} from '../services/welcome-near.js';

const router = Router();

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

function normalizeAccountId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const accountId = value.trim().toLowerCase();
  return ACCOUNT_ID_PATTERN.test(accountId) ? accountId : null;
}

router.post(
  '/welcome-near/challenge',
  async (req: Request, res: Response): Promise<void> => {
    const accountId = normalizeAccountId(req.body?.account_id);
    if (!accountId) {
      res.status(400).json({ success: false, error: 'account_id is required' });
      return;
    }

    if (!config.welcomeNear.enabled) {
      res.json({ success: true, enabled: false });
      return;
    }

    res.json({
      success: true,
      enabled: true,
      challenge: buildWelcomeNearChallenge(accountId),
    });
  }
);

router.use(partnerAuth);

router.post(
  '/welcome-near',
  async (req: Request, res: Response): Promise<void> => {
    const appId = (req as Request & { partnerAppId: string }).partnerAppId;
    if (appId !== config.portalRewardsAppId) {
      res
        .status(403)
        .json({ success: false, error: 'Portal rewards key required' });
      return;
    }

    const accountId = normalizeAccountId(req.body?.account_id);
    const publicKey =
      typeof req.body?.public_key === 'string' ? req.body.public_key : '';
    const signature =
      typeof req.body?.signature === 'string' ? req.body.signature : '';
    const message =
      typeof req.body?.message === 'string' ? req.body.message : '';

    if (!accountId) {
      res.status(400).json({ success: false, error: 'account_id is required' });
      return;
    }

    if (!config.welcomeNear.enabled) {
      res.json({ success: true, dripped: false, enabled: false });
      return;
    }

    if (!publicKey || !signature || !message) {
      res.status(401).json({
        success: false,
        error: 'public_key, signature, and message are required',
      });
      return;
    }

    const verification = await verifyWelcomeNearAuth({
      accountId,
      publicKey,
      signature,
      message,
    });
    if (!verification.valid) {
      res.status(401).json({
        success: false,
        error: verification.error ?? 'Invalid welcome NEAR auth',
      });
      return;
    }

    const existing = await query<{
      status: string;
      transfer_tx_hash: string | null;
      amount_yocto: string;
    }>(
      `SELECT status, transfer_tx_hash, amount_yocto
       FROM portal_welcome_near_events
       WHERE account_id = $1`,
      [accountId]
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      res.json({
        success: true,
        dripped: row.status === 'completed',
        already_received: true,
        amount_yocto: row.amount_yocto,
        tx_hash: row.transfer_tx_hash,
      });
      return;
    }

    const needsDrip = await accountNeedsWelcomeNear(accountId);
    if (!needsDrip) {
      res.json({
        success: true,
        dripped: false,
        sufficient_balance: true,
      });
      return;
    }

    const amountYocto = config.welcomeNear.amountYocto;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      const insert = await client.query<{ id: string }>(
        `INSERT INTO portal_welcome_near_events (
           account_id,
           amount_yocto,
           network,
           public_key,
           status
         ) VALUES ($1, $2, $3, $4, 'pending')
         ON CONFLICT (account_id) DO NOTHING
         RETURNING id`,
        [accountId, amountYocto, config.nearNetwork, publicKey]
      );

      if (insert.rowCount === 0) {
        await client.query('ROLLBACK');
        const raced = await query<{
          status: string;
          transfer_tx_hash: string | null;
          amount_yocto: string;
        }>(
          `SELECT status, transfer_tx_hash, amount_yocto
           FROM portal_welcome_near_events
           WHERE account_id = $1`,
          [accountId]
        );
        const row = raced.rows[0];
        res.json({
          success: true,
          dripped: row?.status === 'completed',
          already_received: true,
          amount_yocto: row?.amount_yocto,
          tx_hash: row?.transfer_tx_hash,
        });
        return;
      }

      const relay = await relayWelcomeNearTransfer(accountId, amountYocto);
      if (!relay.success || !relay.tx_hash) {
        await client.query(
          `UPDATE portal_welcome_near_events
           SET status = 'failed',
               error = $2,
               updated_at = now()
           WHERE account_id = $1`,
          [accountId, relay.error ?? 'Relayer transfer failed']
        );
        await client.query('COMMIT');
        res.status(relay.httpStatus >= 500 ? 502 : 400).json({
          success: false,
          dripped: false,
          error: relay.error ?? 'Welcome NEAR transfer failed',
        });
        return;
      }

      await client.query(
        `UPDATE portal_welcome_near_events
         SET status = 'completed',
             transfer_tx_hash = $2,
             updated_at = now()
         WHERE account_id = $1`,
        [accountId, relay.tx_hash]
      );
      await client.query('COMMIT');

      res.json({
        success: true,
        dripped: true,
        amount_yocto: amountYocto,
        tx_hash: relay.tx_hash,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({ accountId, error: msg }, 'Welcome NEAR drip failed');
      res
        .status(500)
        .json({ success: false, error: 'Welcome NEAR drip failed' });
    } finally {
      client.release();
    }
  }
);

export default router;
