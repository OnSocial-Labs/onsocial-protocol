import { Router } from 'express';
import type { Request, Response } from 'express';
import nacl from 'tweetnacl';
import { config } from '../config/index.js';
import { pool, query } from '../db/index.js';
import { logger } from '../logger.js';
import { partnerAuth } from '../middleware/partnerAuth.js';
import { accessKeyExists, creditOnChain } from '../services/near.js';

const router = Router();

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const REWARD_AMOUNT = '100000000000000000'; // 0.1 SOCIAL, 18 decimals.
const DAILY_CAP = 1_000_000_000_000_000_000n; // 1 SOCIAL.
const AUTH_MAX_AGE_MS = 10 * 60 * 1000;
const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

const ACTION_CONFIG = {
  profile_created: { cap: 1, scope: 'once' },
  daily_active: { cap: 1, scope: 'daily' },
  stand_given: { cap: 3, scope: 'daily_target' },
  mutual_stand_created: { cap: 3, scope: 'daily_target' },
  endorsement_given: { cap: 3, scope: 'daily_target_topic' },
} as const;

type PortalRewardAction = keyof typeof ACTION_CONFIG;

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

function isPortalRewardAction(value: unknown): value is PortalRewardAction {
  return typeof value === 'string' && value in ACTION_CONFIG;
}

function normalizeAccountId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const accountId = value.trim().toLowerCase();
  return ACCOUNT_ID_PATTERN.test(accountId) ? accountId : null;
}

function normalizeTopic(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const topic = value.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 64);
  return topic || null;
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
    (parsed.topic ?? null) === topic
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

function buildIdempotencyKey({
  action,
  accountId,
  appId,
  rewardDay,
  targetAccountId,
  topic,
}: {
  action: PortalRewardAction;
  accountId: string;
  appId: string;
  rewardDay: string;
  targetAccountId: string | null;
  topic: string | null;
}): string {
  const cfg = ACTION_CONFIG[action];
  if (cfg.scope === 'once') return `${appId}:${accountId}:${action}`;
  if (cfg.scope === 'daily')
    return `${appId}:${accountId}:${rewardDay}:${action}`;
  if (cfg.scope === 'daily_target') {
    return `${appId}:${accountId}:${rewardDay}:${action}:${targetAccountId ?? ''}`;
  }
  return `${appId}:${accountId}:${rewardDay}:${action}:${targetAccountId ?? ''}:${topic ?? ''}`;
}

router.use(partnerAuth);

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
    if (
      (cfg.scope === 'daily_target' || cfg.scope === 'daily_target_topic') &&
      !targetAccountId
    ) {
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

      const dailyRows = await client.query<{ amount: string }>(
        `SELECT amount FROM portal_reward_events
       WHERE app_id = $1
         AND account_id = $2
         AND reward_day = $3::date
         AND status = 'credited'`,
        [appId, accountId, rewardDay]
      );
      const dailyTotal = dailyRows.rows.reduce((total, row) => {
        try {
          return total + BigInt(row.amount);
        } catch {
          return total;
        }
      }, 0n);
      if (dailyTotal + BigInt(REWARD_AMOUNT) > DAILY_CAP) {
        await client.query('COMMIT');
        res.json({
          success: true,
          credited: false,
          capped: true,
          reason: 'daily_cap',
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
          REWARD_AMOUNT,
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
      const txHash = await creditOnChain(
        accountId,
        REWARD_AMOUNT,
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

      res.json({
        success: true,
        credited: true,
        action,
        amount: REWARD_AMOUNT,
        tx_hash: txHash,
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
