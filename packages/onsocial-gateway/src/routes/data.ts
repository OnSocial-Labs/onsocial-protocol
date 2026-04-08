/**
 * Data routes — read-only view calls to the core-onsocial contract.
 *
 * GET /data/get?keys=k1,k2&accountId=...  — fetch entries by key
 * GET /data/get-one?key=k&accountId=...    — fetch a single entry
 * GET /data/keys?prefix=p&fromKey=...      — list keys by prefix
 * GET /data/count?prefix=p                 — count keys by prefix
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { config } from '../config/index.js';
import { rpcQuery } from '../rpc/index.js';

export const dataRouter = Router();

const coreContract =
  config.nearNetwork === 'mainnet'
    ? 'core.onsocial.near'
    : 'core.onsocial.testnet';

interface CallFunctionResult {
  result: number[];
  logs: string[];
  block_height: number;
  block_hash: string;
}

function decodeResult<T>(raw: CallFunctionResult): T {
  const bytes = Buffer.from(raw.result);
  return JSON.parse(bytes.toString('utf-8')) as T;
}

// ---------------------------------------------------------------------------
// GET /data/get — fetch one or more entries by key
// ---------------------------------------------------------------------------
dataRouter.get('/get', async (req: Request, res: Response) => {
  const keysParam = req.query.keys;
  if (!keysParam || typeof keysParam !== 'string') {
    res.status(400).json({ error: 'Missing required query param: keys' });
    return;
  }

  const keys = keysParam
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  if (keys.length === 0) {
    res.status(400).json({ error: 'keys param must not be empty' });
    return;
  }
  if (keys.length > 100) {
    res.status(400).json({ error: 'Maximum 100 keys per request' });
    return;
  }

  const accountId =
    typeof req.query.accountId === 'string' ? req.query.accountId : undefined;

  const args = { keys, account_id: accountId ?? null };

  try {
    const raw = await rpcQuery<CallFunctionResult>({
      request_type: 'call_function',
      account_id: coreContract,
      method_name: 'get',
      args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
      finality: 'optimistic',
    });
    const entries = decodeResult(raw);
    res.json(entries);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: 'RPC call failed', details: msg });
  }
});

// ---------------------------------------------------------------------------
// GET /data/get-one — fetch a single entry
// ---------------------------------------------------------------------------
dataRouter.get('/get-one', async (req: Request, res: Response) => {
  const key = req.query.key;
  if (!key || typeof key !== 'string') {
    res.status(400).json({ error: 'Missing required query param: key' });
    return;
  }

  const accountId =
    typeof req.query.accountId === 'string' ? req.query.accountId : undefined;

  const args = { key, account_id: accountId ?? null };

  try {
    const raw = await rpcQuery<CallFunctionResult>({
      request_type: 'call_function',
      account_id: coreContract,
      method_name: 'get_one',
      args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
      finality: 'optimistic',
    });
    const entry = decodeResult(raw);
    res.json(entry);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: 'RPC call failed', details: msg });
  }
});

// ---------------------------------------------------------------------------
// GET /data/keys — list keys by prefix with pagination
// ---------------------------------------------------------------------------
dataRouter.get('/keys', async (req: Request, res: Response) => {
  const prefix = req.query.prefix;
  if (!prefix || typeof prefix !== 'string') {
    res.status(400).json({ error: 'Missing required query param: prefix' });
    return;
  }

  const fromKey =
    typeof req.query.fromKey === 'string' ? req.query.fromKey : undefined;
  const limit =
    typeof req.query.limit === 'string'
      ? Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 50)
      : 50;
  const withValues = req.query.withValues === 'true';

  const args = {
    prefix,
    from_key: fromKey ?? null,
    limit,
    with_values: withValues,
  };

  try {
    const raw = await rpcQuery<CallFunctionResult>({
      request_type: 'call_function',
      account_id: coreContract,
      method_name: 'list_keys',
      args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
      finality: 'optimistic',
    });
    const entries = decodeResult(raw);
    res.json(entries);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: 'RPC call failed', details: msg });
  }
});

// ---------------------------------------------------------------------------
// GET /data/count — count keys matching a prefix
// ---------------------------------------------------------------------------
dataRouter.get('/count', async (req: Request, res: Response) => {
  const prefix = req.query.prefix;
  if (!prefix || typeof prefix !== 'string') {
    res.status(400).json({ error: 'Missing required query param: prefix' });
    return;
  }

  try {
    const raw = await rpcQuery<CallFunctionResult>({
      request_type: 'call_function',
      account_id: coreContract,
      method_name: 'count_keys',
      args_base64: Buffer.from(JSON.stringify({ prefix })).toString('base64'),
      finality: 'optimistic',
    });
    const count = decodeResult<number>(raw);
    res.json({ count });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: 'RPC call failed', details: msg });
  }
});
