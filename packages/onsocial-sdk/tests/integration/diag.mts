import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { OnSocial } from '../../packages/onsocial-sdk/src/client.js';

const GATEWAY_URL = 'https://testnet.onsocial.id';
const ACCOUNT_ID = 'test01.onsocial.testnet';
const credsFile = `${process.env.HOME}/.near-credentials/testnet/${ACCOUNT_ID}.json`;

function base58Decode(s: string): Buffer {
  const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let num = BigInt(0);
  for (const c of s) num = num * 58n + BigInt(A.indexOf(c));
  const hex = num.toString(16).padStart(2, '0');
  return Buffer.from(hex.length % 2 ? '0' + hex : hex, 'hex');
}
function signNep413(message: string, nonceB64: string, recipient: string, secretKey: Buffer): string {
  const nonce = Buffer.from(nonceB64, 'base64');
  const prefix = Buffer.alloc(4); prefix.writeUInt32LE(2 ** 31 + 413, 0);
  const enc = (s: string) => { const b = Buffer.from(s); const l = Buffer.alloc(4); l.writeUInt32LE(b.length); return Buffer.concat([l, b]); };
  const payload = Buffer.concat([enc(message), nonce, enc(recipient), Buffer.from([0])]);
  const hash = crypto.createHash('sha256').update(Buffer.concat([prefix, payload])).digest();
  return Buffer.from(crypto.sign(null, hash, {
    key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), secretKey.subarray(0, 32)]),
    format: 'der', type: 'pkcs8',
  })).toString('base64');
}

async function main() {
  const creds = JSON.parse(fs.readFileSync(credsFile, 'utf8'));
  const secretKey = base58Decode(creds.private_key.replace(/^ed25519:/, ''));

  const session = new OnSocial({ gatewayUrl: GATEWAY_URL, network: 'testnet' });
  const { challenge } = await session.http.post<any>('/auth/challenge', { accountId: ACCOUNT_ID });
  const sig = signNep413(challenge.message, challenge.nonce, challenge.recipient, secretKey);
  await session.auth.login({ accountId: ACCOUNT_ID, publicKey: creds.public_key, signature: sig, message: challenge.message });
  console.log('Session auth OK');

  // Write with session client first to compare
  const field = `diag_${Date.now()}`;
  console.log(`Writing profile/${field} with SESSION...`);
  const sessionWrite = await session.social.setProfile({ [field]: 'session-value' });
  console.log('Session write:', JSON.stringify(sessionWrite));

  // Create API key
  const keyResult = await session.http.post<any>('/developer/keys', { label: 'diag-test' });
  console.log('API key:', keyResult.prefix);

  // Write with API key client
  const apiOs = new OnSocial({ gatewayUrl: GATEWAY_URL, network: 'testnet', apiKey: keyResult.key });
  const field2 = `diag_api_${Date.now()}`;
  console.log(`Writing profile/${field2} with API KEY...`);
  const apiWrite = await apiOs.social.setProfile({ [field2]: 'api-value' });
  console.log('API key write:', JSON.stringify(apiWrite));

  // Wait
  console.log('Waiting 8s...');
  await new Promise(r => setTimeout(r, 8000));

  // Read back both
  const e1 = await session.social.getOne(`profile/${field}`, ACCOUNT_ID);
  console.log(`Session-written (${field}):`, JSON.stringify(e1));
  const e2 = await session.social.getOne(`profile/${field2}`, ACCOUNT_ID);
  console.log(`API-key-written (${field2}):`, JSON.stringify(e2));

  // Cleanup
  await session.http.delete(`/developer/keys/${keyResult.prefix}`);
  console.log('Cleaned up');
}
main().catch(e => { console.error(e); process.exit(1); });
