import { Router } from 'express';
import type { Request, Response } from 'express';
import { config } from '../config/index.js';
import { pool, query } from '../db/index.js';
import { logger } from '../logger.js';
import { partnerAuth } from '../middleware/partnerAuth.js';
import { relayWelcomeNearTransfer } from '../services/welcome-near-relay.js';
import {
  accountNeedsWelcomeNear,
  welcomeNearTopUpAmountYocto,
} from '../services/welcome-near.js';
import { viewAccountBalance } from '../services/near.js';

const router = Router();

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

function normalizeAccountId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const accountId = value.trim().toLowerCase();
  return ACCOUNT_ID_PATTERN.test(accountId) ? accountId : null;
}

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

    if (!accountId) {
      res.status(400).json({ success: false, error: 'account_id is required' });
      return;
    }

    if (!config.welcomeNear.enabled) {
      res.json({ success: true, dripped: false, enabled: false });
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

    const balanceYocto = await viewAccountBalance(accountId);
    const amountYocto = welcomeNearTopUpAmountYocto(balanceYocto);
    if (!amountYocto) {
      res.json({
        success: true,
        dripped: false,
        sufficient_balance: true,
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

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      if (existing.rows.length === 0) {
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
          [accountId, amountYocto, config.nearNetwork, 'portal']
        );

        if (insert.rowCount === 0) {
          await client.query('ROLLBACK');
          res.status(409).json({
            success: false,
            error: 'Welcome NEAR drip already in progress',
          });
          return;
        }
      } else {
        await client.query(
          `UPDATE portal_welcome_near_events
           SET status = 'pending',
               amount_yocto = $2,
               error = NULL,
               updated_at = now()
           WHERE account_id = $1`,
          [accountId, amountYocto]
        );
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
        topped_up: existing.rows.length > 0,
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
