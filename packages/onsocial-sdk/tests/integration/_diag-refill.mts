/* eslint-disable */
import { GATEWAY_URL, ACCOUNT_ID, CREDS_FILE } from './helpers.js';
import * as nearAPI from 'near-api-js';
import * as fs from 'node:fs';

const creds = JSON.parse(fs.readFileSync(CREDS_FILE, 'utf8'));
const accountId = creds.account_id as string;
const privateKey = creds.private_key as string;
const CONTRACT = process.env.CORE_CONTRACT || 'core.onsocial.testnet';

console.log('signer:', accountId, '/ contract:', CONTRACT);

const before = await fetch(`${GATEWAY_URL}/data/platform-pool`).then((r) => r.json());
console.log('pool before:', JSON.stringify(before));

const keyStore = new nearAPI.keyStores.InMemoryKeyStore();
const keyPair = nearAPI.KeyPair.fromString(privateKey as any);
await keyStore.setKey('testnet', accountId, keyPair);

const near = await nearAPI.connect({
  networkId: 'testnet',
  keyStore,
  nodeUrl: 'https://rpc.testnet.near.org',
});
const account = await near.account(accountId);

// Deposit 5 NEAR -> ~500 KB additional pool capacity
const amountStr = process.env.AMOUNT_YOCTO || '5000000000000000000000000';
const args = {
  request: {
    action: {
      type: 'set',
      data: { 'storage/platform_pool_deposit': { amount: amountStr } },
    },
  },
};

console.log('depositing', amountStr, 'yocto');
const tx = await account.functionCall({
  contractId: CONTRACT,
  methodName: 'execute',
  args,
  gas: BigInt('100000000000000') as any,
  attachedDeposit: BigInt(amountStr) as any,
});
console.log('tx hash:', tx.transaction.hash);
console.log('status:', JSON.stringify(tx.status).slice(0, 400));

await new Promise((r) => setTimeout(r, 4000));
const after = await fetch(`${GATEWAY_URL}/data/platform-pool`).then((r) => r.json());
console.log('pool after:', JSON.stringify(after));
console.log('ACCOUNT_ID:', ACCOUNT_ID);
