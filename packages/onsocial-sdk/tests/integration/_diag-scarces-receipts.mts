/* eslint-disable */
/**
 * Run scarces integration tests and capture every tx hash, then probe the
 * NEAR RPC for inner receipt failures (which the relayer hides).
 */
import { execSync } from 'node:child_process';
const RPC_URL = 'https://rpc.testnet.near.org';
const SIGNER = process.env.RELAYER_ACCOUNT_ID || 'relayer.onsocial.testnet';
async function txStatus(hash: string) {
  const r = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'EXPERIMENTAL_tx_status',
      params: { tx_hash: hash, sender_account_id: SIGNER, wait_until: 'NONE' },
    }),
  }).then((x) => x.json());
  return r.result;
}

console.log('running scarces integration suite, capturing tx hashes...');
let out = '';
try {
  out = execSync(
    'pnpm vitest run tests/integration/scarces.integration.test.ts --reporter=verbose 2>&1',
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );
} catch (e: any) {
  out = (e.stdout || '') + (e.stderr || '');
}

// SDK debug logs print tx hashes; otherwise we have to instrument.
// Fallback: pull last 50 scarces transactions for ACCOUNT_ID via nearblocks.
const ACCOUNT_ID = process.env.ACCOUNT_ID || 'test01.onsocial.testnet';
const SCARCES = process.env.SCARCES_CONTRACT || 'scarces.onsocial.testnet';

const url = `https://api-testnet.nearblocks.io/v1/account/${SCARCES}/txns?from=${ACCOUNT_ID}&per_page=20&order=desc`;
const r = await fetch(url).then((x) => x.json());
const txns: any[] = r.txns || [];
console.log(`found ${txns.length} recent scarces txns from ${ACCOUNT_ID}`);

for (const t of txns.slice(0, 20)) {
  const hash = t.transaction_hash;
  const argsStr: string = t.actions?.[0]?.args || '';
  let actionType = '';
  try {
    const parsed = JSON.parse(argsStr);
    actionType = parsed?.request?.action?.type || '';
  } catch {}
  try {
    const receipt: any = await txStatus(hash);
    const failures: string[] = [];
    for (const ro of receipt.receipts_outcome || []) {
      const s = ro.outcome?.status;
      if (s && typeof s === 'object' && 'Failure' in s) {
        failures.push(JSON.stringify(s.Failure).slice(0, 300));
      }
    }
    const when = new Date(Number(t.block_timestamp) / 1e6).toISOString();
    if (failures.length) {
      console.log(`${when}  ${hash}  ${actionType}  FAIL`);
      for (const f of failures) console.log('    →', f);
    } else {
      console.log(`${when}  ${hash}  ${actionType}  ok`);
    }
  } catch (e: any) {
    console.log(`${hash}  rpc-error: ${e?.message || e}`);
  }
}
