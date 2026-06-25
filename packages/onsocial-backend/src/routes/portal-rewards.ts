import { Router } from 'express';
import type { Request, Response } from 'express';
import nacl from 'tweetnacl';
import { config } from '../config/index.js';
import type { PoolClient } from 'pg';
import { pool, query } from '../db/index.js';
import { logger } from '../logger.js';
import { partnerAuth } from '../middleware/partnerAuth.js';
import { accessKeyExists, creditOnChain } from '../services/near.js';
import { evaluateAppCredit } from '../services/app-reward-limits.js';
import {
  ACTION_CONFIG,
  buildIdempotencyKey,
  isPortalRewardAction,
  requiresTargetAccount,
  type PortalRewardAction,
} from '../services/portal-reward-policy.js';
import { loadPortalRewardActionProgress } from '../services/portal-reward-progress.js';

const router = Router();

interface PortalRewardActionBody {
  account_id?: unknown;
  action?: unknown;
  target_account_id?: unknown;
  topic?: unknown;
  proof?: unknown;
  auth?: {
    public_key?: unknown;
    signature?: unknown;
    message?: unknown;
  };
}

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const AUTH_MAX_AGE_MS = 10 * 60 * 1000;
const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function normalizeAccountId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const accountId = value.trim().toLowerCase();
  return ACCOUNT_ID_PATTERN.test(accountId) ? accountId : null;
}

function normalizeTopic(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9_.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 40);
  return normalized || null;
}

function getRewardDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function decodeBase58(value: string): Uint8Array | null {
  const bytes = [0];
  for (const char of value) {
    const valueIndex = BASE58_ALPHABET.indexOf(char);
    if (valueIndex < 0) return null;

    let carry = valueIndex;
    for (let i = 0; i < bytes.length; i += 1) {
      const next = bytes[i] * 58 + carry;
      bytes[i] = next & 0xff;
      carry = next >> 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  for (const char of value) {
    if (char !== '1') break;
    bytes.push(0);
  }

  return Uint8Array.from(bytes.reverse());
}

function publicKeyBytes(publicKey: string): Uint8Array | null {
  const encoded = publicKey.startsWith('ed25519:')
    ? publicKey.slice('ed25519:'.length)
    : publicKey;
  return decodeBase58(encoded);
}

function signedMessageMatchesRequest({
  accountId,
  action,
  message,
  targetAccountId,
  topic,
}: {
  accountId: string;
  action: PortalRewardAction;
  message: string;
  targetAccountId: string | null;
  topic: string | null;
}): boolean {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(message) as Record<string, unknown>;
  } catch {
    return false;
  }

  const issuedAt = typeof parsed.issued_at === 'number' ? parsed.issued_at : 0;
  if (!issuedAt || Math.abs(Date.now() - issuedAt) > AUTH_MAX_AGE_MS) {
    return false;
  }

  return (
    parsed.account_id === accountId &&
    parsed.action === action &&
    (parsed.target_account_id ?? null) === targetAccountId &&
    normalizeTopic(
      typeof parsed.topic === 'string' ? parsed.topic : undefined
    ) === topic
  );
}

async function verifyRewardAuth({
  accountId,
  action,
  auth,
  targetAccountId,
  topic,
}: {
  accountId: string;
  action: PortalRewardAction;
  auth: PortalRewardActionBody['auth'];
  targetAccountId: string | null;
  topic: string | null;
}): Promise<boolean> {
  const publicKey = typeof auth?.public_key === 'string' ? auth.public_key : '';
  const signature = typeof auth?.signature === 'string' ? auth.signature : '';
  const message = typeof auth?.message === 'string' ? auth.message : '';
  const keyBytes = publicKeyBytes(publicKey);
  const signatureBytes = Buffer.from(signature, 'base64');

  if (
    !publicKey ||
    !keyBytes ||
    keyBytes.length !== 32 ||
    signatureBytes.length !== 64 ||
    !signedMessageMatchesRequest({
      accountId,
      action,
      message,
      targetAccountId,
      topic,
    })
  ) {
    return false;
  }

  const isSigned = nacl.sign.detached.verify(
    new TextEncoder().encode(message),
    signatureBytes,
    keyBytes
  );
  if (!isSigned) return false;

  return accessKeyExists(accountId, publicKey);
}

async function hasPriorTargetCredit(
  client: PoolClient,
  {
    appId,
    accountId,
    action,
    targetAccountId,
    topic,
  }: {
    appId: string;
    accountId: string;
    action: PortalRewardAction;
    targetAccountId: string;
    topic: string | null;
  }
): Promise<boolean> {
  const cfg = ACTION_CONFIG[action];
  const result =
    cfg.scope === 'target_topic_once'
      ? await client.query<{ id: string }>(
          `SELECT id FROM portal_reward_events
         WHERE app_id = $1
           AND account_id = $2
           AND action = $3
           AND target_account_id = $4
           AND topic IS NOT DISTINCT FROM $5
           AND status = 'credited'
         LIMIT 1`,
          [appId, accountId, action, targetAccountId, topic]
        )
      : await client.query<{ id: string }>(
          `SELECT id FROM portal_reward_events
         WHERE app_id = $1
           AND account_id = $2
           AND action = $3
           AND target_account_id = $4
           AND status = 'credited'
         LIMIT 1`,
          [appId, accountId, action, targetAccountId]
        );
  return Boolean(result.rows[0]);
}

router.use(partnerAuth);

router.get(
  '/reward-progress',
  async (req: Request, res: Response): Promise<void> => {
    const appId = (req as Request & { partnerAppId: string }).partnerAppId;
    if (appId !== config.portalRewardsAppId) {
      res
        .status(403)
        .json({ success: false, error: 'Portal rewards key required' });
      return;
    }

    const accountId = normalizeAccountId(req.query.account_id);
    if (!accountId) {
      res.status(400).json({ success: false, error: 'account_id is required' });
      return;
    }

    try {
      const actions = await loadPortalRewardActionProgress({
        accountId,
        appId,
        rewardDay: getRewardDay(),
      });
      res.json({ success: true, actions, reward_day: getRewardDay() });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        { error: message, accountId },
        'Portal reward progress lookup failed'
      );
      res.status(502).json({ success: false, error: message });
    }
  }
);

router.post(
  '/reward-action',
  async (req: Request, res: Response): Promise<void> => {
    const appId = (req as Request & { partnerAppId: string }).partnerAppId;
    if (appId !== config.portalRewardsAppId) {
      res
        .status(403)
        .json({ success: false, error: 'Portal rewards key required' });
      return;
    }

    const body = req.body as PortalRewardActionBody;
    const action = body.action;
    const accountId = normalizeAccountId(body.account_id);
    const targetAccountId = normalizeAccountId(body.target_account_id);
    const topic = normalizeTopic(body.topic);

    if (!accountId) {
      res.status(400).json({ success: false, error: 'account_id is required' });
      return;
    }
    if (!isPortalRewardAction(action)) {
      res
        .status(400)
        .json({ success: false, error: 'Unsupported reward action' });
      return;
    }

    const cfg = ACTION_CONFIG[action];
    if (requiresTargetAccount(action) && !targetAccountId) {
      res
        .status(400)
        .json({ success: false, error: 'target_account_id is required' });
      return;
    }
    if (targetAccountId && targetAccountId === accountId) {
      res
        .status(400)
        .json({ success: false, error: 'Self rewards are not allowed' });
      return;
    }
    if (
      !(await verifyRewardAuth({
        accountId,
        action,
        auth: body.auth,
        targetAccountId,
        topic,
      }))
    ) {
      res
        .status(401)
        .json({ success: false, error: 'Invalid reward signature' });
      return;
    }

    const creditDecision = await evaluateAppCredit(accountId, appId);
    if (!creditDecision.allowed) {
      res.json({
        success: true,
        credited: false,
        capped: true,
        reason: creditDecision.reason,
        daily_remaining:
          creditDecision.headroom?.dailyRemainingYocto.toString() ?? '0',
      });
      return;
    }

    const rewardAmount = creditDecision.amountYocto.toString();

    const rewardDay = getRewardDay();
    const idempotencyKey = buildIdempotencyKey({
      action,
      accountId,
      appId,
      rewardDay,
      targetAccountId,
      topic,
    });
    const source = `portal:${action}`;

    const client = await pool.connect();
    let eventId: string | null = null;

    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `${appId}:${accountId}:${rewardDay}`,
      ]);

      const existing = await client.query<{
        id: string;
        status: string;
        reward_tx_hash: string | null;
      }>(
        `SELECT id, status, reward_tx_hash FROM portal_reward_events
       WHERE idempotency_key = $1
       FOR UPDATE`,
        [idempotencyKey]
      );

      if (existing.rows[0] && existing.rows[0].status !== 'failed') {
        await client.query('COMMIT');
        res.json({
          success: true,
          credited: false,
          duplicate: true,
          status: existing.rows[0].status,
          tx_hash: existing.rows[0].reward_tx_hash,
        });
        return;
      }

      if (existing.rows[0]?.status === 'failed') {
        await client.query('DELETE FROM portal_reward_events WHERE id = $1', [
          existing.rows[0].id,
        ]);
      }

      if (targetAccountId && requiresTargetAccount(action)) {
        if (
          await hasPriorTargetCredit(client, {
            appId,
            accountId,
            action,
            targetAccountId,
            topic,
          })
        ) {
          await client.query('COMMIT');
          res.json({
            success: true,
            credited: false,
            duplicate: true,
            reason: 'prior_target_credit',
          });
          return;
        }
      }

      const actionCount = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM portal_reward_events
       WHERE app_id = $1
         AND account_id = $2
         AND action = $3
         AND reward_day = $4::date
         AND status = 'credited'`,
        [appId, accountId, action, rewardDay]
      );
      if (Number(actionCount.rows[0]?.count ?? 0) >= cfg.cap) {
        await client.query('COMMIT');
        res.json({
          success: true,
          credited: false,
          capped: true,
          reason: 'action_daily_cap',
        });
        return;
      }

      const inserted = await client.query<{ id: string }>(
        `INSERT INTO portal_reward_events (
         app_id,
         account_id,
         action,
         target_account_id,
         topic,
         reward_day,
         idempotency_key,
         amount,
         source,
         proof,
         status
       ) VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8, $9, $10::jsonb, 'pending')
       RETURNING id`,
        [
          appId,
          accountId,
          action,
          targetAccountId,
          topic,
          rewardDay,
          idempotencyKey,
          rewardAmount,
          source,
          JSON.stringify(body.proof ?? {}),
        ]
      );
      eventId = inserted.rows[0]?.id ?? null;

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        { error: message, action, accountId },
        'Portal reward gate failed'
      );
      res.status(502).json({ success: false, error: message });
      return;
    } finally {
      client.release();
    }

    try {
      const refreshedDecision = await evaluateAppCredit(
        accountId,
        appId,
        creditDecision.amountYocto
      );
      if (!refreshedDecision.allowed) {
        if (eventId) {
          await query(
            `UPDATE portal_reward_events
           SET status = 'failed',
               error = $2,
               updated_at = now()
           WHERE id = $1`,
            [eventId, refreshedDecision.reason]
          );
        }
        res.json({
          success: true,
          credited: false,
          capped: true,
          reason: refreshedDecision.reason,
        });
        return;
      }

      const txHash = await creditOnChain(
        accountId,
        refreshedDecision.amountYocto.toString(),
        source,
        appId
      );
      if (eventId) {
        await query(
          `UPDATE portal_reward_events
         SET status = 'credited',
             reward_tx_hash = $2,
             updated_at = now()
         WHERE id = $1`,
          [eventId, txHash]
        );
      }

      const actions = await loadPortalRewardActionProgress({
        accountId,
        appId,
        rewardDay,
      });

      res.json({
        success: true,
        credited: true,
        action,
        amount: refreshedDecision.amountYocto.toString(),
        tx_hash: txHash,
        actions,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (eventId) {
        await query(
          `UPDATE portal_reward_events
         SET status = 'failed',
             error = $2,
             updated_at = now()
         WHERE id = $1`,
          [eventId, message]
        );
      }
      logger.error(
        { error: message, action, accountId },
        'Portal reward credit failed'
      );
      res.status(502).json({ success: false, error: message });
    }
  }
);

export default router;
