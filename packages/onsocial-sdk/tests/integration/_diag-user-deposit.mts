/* eslint-disable */
/**
 * Diagnostic: deposit a small amount of NEAR into test01's personal
 * storage record, then attempt a small `set` write to confirm the
 * write succeeds via the user-balance fallback (since the platform
 * pool is exhausted).
 */
import { GATEWAY_URL, ACCOUNT_ID, CREDS_FILE } from './helpers.js';
import {
  Account,
  JsonRpcProvider,
  KeyPair,
  KeyPairSigner,
  actions,
} from 'near-api-js';
import * as fs from 'node:fs';

const creds = JSON.parse(fs.readFileSync(CREDS_FILE, 'utf8'));
const accountId = creds.account_id as string;
const privateKey = creds.private_key as string;
const CONTRACT = process.env.CORE_CONTRACT || 'core.onsocial.testnet';
const DEPOSIT_YOCTO = process.env.AMOUNT_YOCTO || '10000000000000000000000'; // 0.01 NEAR

console.log('signer:', accountId, '/ contract:', CONTRACT);
console.log('deposit:', DEPOSIT_YOCTO, 'yocto');

async function getStorage() {
  return fetch(
    `${GATEWAY_URL}/data/storage-balance?accountId=${ACCOUNT_ID}`
  ).then((r) => r.json());
}
async function getPlatformPool() {
  return fetch(`${GATEWAY_URL}/data/platform-pool`).then((r) => r.json());
}

const beforeStorage = await getStorage();
const beforePool = await getPlatformPool();
console.log('storage before:', JSON.stringify(beforeStorage));
console.log('pool before:', JSON.stringify(beforePool));

const provider = new JsonRpcProvider({ url: 'https://rpc.testnet.near.org' });
const keyPair = KeyPair.fromString(privateKey as any);
const signer = new KeyPairSigner(keyPair);
const account = new Account(accountId, provider, signer);

async function callExecute(args: unknown, deposit: string) {
  const action = actions.functionCall(
    'execute',
    args as any,
    BigInt('100000000000000'),
    BigInt(deposit)
  );
  return account.signAndSendTransaction({
    receiverId: CONTRACT,
    actions: [action],
  });
}

console.log('\n--- step 1: deposit to user storage ---');
const depositArgs = {
  request: {
    action: {
      type: 'set',
      data: { 'storage/deposit': { amount: DEPOSIT_YOCTO } },
    },
  },
};
const depTx = await callExecute(depositArgs, DEPOSIT_YOCTO);
console.log('deposit tx:', depTx.transaction.hash);
console.log('deposit status:', JSON.stringify(depTx.status).slice(0, 400));
const depReceipts = (depTx as any).receipts_outcome || [];
for (const r of depReceipts) {
  const s = r.outcome?.status;
  if (s && typeof s === 'object' && 'Failure' in s) {
    console.log(
      'deposit inner FAILURE:',
      JSON.stringify(s.Failure).slice(0, 600)
    );
  }
}

await new Promise((r) => setTimeout(r, 4000));
const afterDeposit = await getStorage();
console.log('storage after deposit:', JSON.stringify(afterDeposit));

console.log('\n--- step 2: small set write ---');
const writeKey = `saved/post/diag_${Date.now()}`;
const writeArgs = {
  request: {
    action: {
      type: 'set',
      data: { [writeKey]: { v: 1, ts: Date.now() } },
    },
  },
};
try {
  const wTx = await callExecute(writeArgs, '0');
  console.log('write tx:', wTx.transaction.hash);
  console.log('write status:', JSON.stringify(wTx.status).slice(0, 400));
  const receipts = (wTx as any).receipts_outcome || [];
  for (const r of receipts) {
    const s = r.outcome?.status;
    if (s && typeof s === 'object' && 'Failure' in s) {
      console.log(
        'write inner FAILURE:',
        JSON.stringify(s.Failure).slice(0, 600)
      );
    }
  }
} catch (e: any) {
  console.log('write threw:', String(e?.message || e).slice(0, 600));
}

await new Promise((r) => setTimeout(r, 4000));
const afterWrite = await getStorage();
const poolAfter = await getPlatformPool();
console.log('\nstorage after write:', JSON.stringify(afterWrite));
console.log('pool after write:', JSON.stringify(poolAfter));
