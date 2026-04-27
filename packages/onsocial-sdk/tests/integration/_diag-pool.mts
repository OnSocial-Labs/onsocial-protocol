import { getClient, ACCOUNT_ID, GATEWAY_URL } from './helpers.js';

const os = await getClient();
console.log('account:', ACCOUNT_ID, 'gateway:', GATEWAY_URL);

const before = await fetch(`${GATEWAY_URL}/data/storage-balance?accountId=${ACCOUNT_ID}`).then((r) => r.json()).catch((e: any) => ({ err: String(e) }));
console.log('storage before:', JSON.stringify(before));
const pool = await fetch(`${GATEWAY_URL}/data/platform-pool`).then((r) => r.json());
console.log('platform-pool:', JSON.stringify(pool));

const key = `post/diag_pool_${Date.now()}`;
console.log('writing key:', key);
let res: any;
try {
  res = await os.social.set({ [key]: { content: 'x' } });
  console.log('set response:', JSON.stringify(res));
} catch (e: any) {
  console.log('set threw:', e?.message ?? String(e));
  process.exit(2);
}

const txHash = res?.txHash ?? res?.tx_hash ?? res?.hash;
if (txHash) {
  // Query relayer for tx status
  const url = `${GATEWAY_URL.replace('/api', '')}/relayer/tx/${txHash}?sender=${ACCOUNT_ID}`;
  const status = await fetch(url).then((r) => r.text()).catch((e) => 'fetch error: ' + e);
  console.log('relayer tx status:', status.slice(0, 1500));

  // Query NEAR RPC directly
  const rpcBody = {
    jsonrpc: '2.0',
    id: 'diag',
    method: 'tx',
    params: { tx_hash: txHash, sender_account_id: ACCOUNT_ID, wait_until: 'FINAL' },
  };
  const rpc = await fetch('https://rpc.testnet.near.org', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(rpcBody),
  }).then((r) => r.json()).catch((e) => ({ err: String(e) }));
  console.log('near rpc status:', JSON.stringify(rpc).slice(0, 3000));
}

// Check if the write actually appeared
await new Promise((r) => setTimeout(r, 3000));
const got = await fetch(`${GATEWAY_URL}/data/get-one?key=${key}&accountId=${ACCOUNT_ID}`).then((r) => r.text());
console.log('readback after 3s:', got.slice(0, 500));
