#!/usr/bin/env node
/**
 * Re-check the locked mainnet contract snapshot.
 *
 * See Resources/mainnet-golive.md
 *
 * Exit 0 if the chain still matches the locked inventory.
 * Exit 1 if an account appeared, vanished, or gained/lost wasm.
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RPC_URL = process.env.NEAR_RPC_URL || 'https://rpc.mainnet.near.org';
const EMPTY_CODE_HASH = '11111111111111111111111111111111';

/** Locked 2026-09-05 snapshot. Update with Resources/mainnet-golive.md. */
export const MAINNET_CONTRACT_SNAPSHOT = {
  live: [
    'token.onsocial.near',
    'rewards.onsocial.near',
    'treasury.onsocial.near',
  ],
  reserved: [
    'onsocial.near',
    'scarces.onsocial.near',
    'relayer.onsocial.near',
  ],
  missing: [
    'core.onsocial.near',
    'boost.onsocial.near',
    'social-spend.onsocial.near',
    'founder-vesting.onsocial.near',
    'governance.onsocial.near',
    'staking-governance.onsocial.near',
    'staking-treasury.onsocial.near',
    'fees.onsocial.near',
  ],
};

function isUnknownAccount(payload) {
  const text = JSON.stringify(payload ?? {});
  return (
    text.includes('UNKNOWN_ACCOUNT') ||
    text.toLowerCase().includes('does not exist') ||
    text.toLowerCase().includes('unknown account')
  );
}

async function rpc(method, params) {
  const response = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'onsocial-mainnet-snapshot',
      method,
      params,
    }),
  });
  if (!response.ok) {
    throw new Error(`RPC HTTP ${response.status} for ${method}`);
  }
  return response.json();
}

async function viewAccount(accountId) {
  const data = await rpc('query', {
    request_type: 'view_account',
    finality: 'final',
    account_id: accountId,
  });
  const result = data.result ?? {};
  const error = data.error ?? result.error;
  if (error) {
    if (isUnknownAccount({ error, result: data })) {
      return { status: 'missing' };
    }
    throw new Error(`${accountId}: ${JSON.stringify(error).slice(0, 400)}`);
  }
  const codeHash = result.code_hash || '';
  const hasCode = Boolean(codeHash) && codeHash !== EMPTY_CODE_HASH;
  return {
    status: hasCode ? 'live' : 'reserved',
    codeHash,
    near: Number(result.amount || 0) / 1e24,
  };
}

function classify(observed, expected) {
  if (observed.status === expected) {
    return { ok: true };
  }
  return {
    ok: false,
    detail: `expected ${expected}, observed ${observed.status}`,
  };
}

export async function checkMainnetContractSnapshot() {
  const rows = [];
  const drift = [];

  const checks = [
    ...MAINNET_CONTRACT_SNAPSHOT.live.map((id) => [id, 'live']),
    ...MAINNET_CONTRACT_SNAPSHOT.reserved.map((id) => [id, 'reserved']),
    ...MAINNET_CONTRACT_SNAPSHOT.missing.map((id) => [id, 'missing']),
  ];

  for (const [accountId, expected] of checks) {
    const observed = await viewAccount(accountId);
    const verdict = classify(observed, expected);
    const row = {
      accountId,
      expected,
      observed: observed.status,
      near: observed.near,
      codeHash: observed.codeHash,
      ok: verdict.ok,
    };
    rows.push(row);
    if (!verdict.ok) {
      drift.push(`${accountId}: ${verdict.detail}`);
    }
  }

  return { rows, drift, rpc: RPC_URL };
}

function formatRow(row) {
  const mark = row.ok ? 'ok' : 'DRIFT';
  const near =
    row.observed === 'missing' || row.near == null
      ? ''
      : `  ${row.near.toFixed(4)} N`;
  return `${mark.padEnd(5)} ${row.accountId.padEnd(36)} ${row.expected.padEnd(8)} → ${row.observed}${near}`;
}

async function main() {
  const { rows, drift, rpc: rpcUrl } = await checkMainnetContractSnapshot();
  console.log(`Mainnet contract snapshot  rpc=${rpcUrl}`);
  console.log('See Resources/mainnet-golive.md\n');
  for (const row of rows) {
    console.log(formatRow(row));
  }
  if (drift.length > 0) {
    console.error(`\n${drift.length} account(s) drifted from the locked plan.`);
    for (const line of drift) {
      console.error(`  ${line}`);
    }
    console.error(
      '\nUpdate Resources/mainnet-golive.md and this snapshot together.'
    );
    process.exit(1);
  }
  console.log('\nSnapshot matches the locked plan.');
}

const invokedDirectly =
  resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
