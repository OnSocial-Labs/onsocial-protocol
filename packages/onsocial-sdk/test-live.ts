#!/usr/bin/env npx tsx
// ---------------------------------------------------------------------------
// OnSocial SDK — Live smoke test against deployed gateway + contracts
//
// Usage:
//   npx tsx test-live.ts
//
// Environment:
//   GATEWAY_URL  — override gateway (default: https://testnet.onsocial.id)
//   ACCOUNT_ID   — NEAR account  (default: test01.onsocial.testnet)
//   CREDS_FILE   — credentials JSON path
// ---------------------------------------------------------------------------

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { OnSocial } from './src/client.js';

// ── Config ─────────────────────────────────────────────────────────────────

const GATEWAY_URL = process.env.GATEWAY_URL || 'https://testnet.onsocial.id';
const ACCOUNT_ID = process.env.ACCOUNT_ID || 'test01.onsocial.testnet';
const CREDS_FILE =
  process.env.CREDS_FILE ||
  path.join(process.env.HOME!, `.near-credentials/testnet/${ACCOUNT_ID}.json`);

// ── Helpers ────────────────────────────────────────────────────────────────

function base58Decode(s: string): Buffer {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let num = BigInt(0);
  for (const c of s) {
    num = num * 58n + BigInt(ALPHABET.indexOf(c));
  }
  const hex = num.toString(16).padStart(2, '0');
  return Buffer.from(hex.length % 2 ? '0' + hex : hex, 'hex');
}

function loadKeypair(credsFile: string) {
  const creds = JSON.parse(fs.readFileSync(credsFile, 'utf8'));
  const privRaw = creds.private_key.replace(/^ed25519:/, '');
  const secretKey = base58Decode(privRaw);
  const publicKey = creds.public_key as string;
  return { secretKey, publicKey, accountId: creds.account_id as string };
}

/** NEP-413 serialize + SHA-256, matching gateway's serializeNep413Payload */
function nep413Hash(message: string, nonce: Buffer, recipient: string): Buffer {
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32LE(2 ** 31 + 413, 0);

  const encStr = (s: string) => {
    const buf = Buffer.from(s, 'utf8');
    const len = Buffer.alloc(4);
    len.writeUInt32LE(buf.length, 0);
    return Buffer.concat([len, buf]);
  };

  // callbackUrl = null → Option::None in borsh = 0x00
  const payload = Buffer.concat([
    encStr(message),
    nonce,
    encStr(recipient),
    Buffer.from([0]),
  ]);

  return crypto
    .createHash('sha256')
    .update(Buffer.concat([prefix, payload]))
    .digest();
}

function signNep413(
  message: string,
  nonceB64: string,
  recipient: string,
  secretKey: Buffer
): string {
  const nonce = Buffer.from(nonceB64, 'base64');
  const hash = nep413Hash(message, nonce, recipient);

  // ed25519 seed is first 32 bytes
  const seed = secretKey.subarray(0, 32);
  const sig = crypto.sign(null, hash, {
    key: Buffer.concat([
      Buffer.from('302e020100300506032b657004220420', 'hex'), // DER prefix for ed25519 private key
      seed,
    ]),
    format: 'der',
    type: 'pkcs8',
  });
  return Buffer.from(sig).toString('base64');
}

// ── Test runner ────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function ok(label: string, detail?: string) {
  passed++;
  console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ''}`);
}

function fail(label: string, err: unknown) {
  failed++;
  const detail =
    err != null && typeof err === 'object'
      ? JSON.stringify(err, Object.getOwnPropertyNames(err), 2)
      : String(err);
  console.log(`  ❌ ${label} —`, detail);
}

async function main() {
  console.log('═'.repeat(60));
  console.log('  OnSocial SDK — Full Pipeline Test');
  console.log('═'.repeat(60));
  console.log(`  Gateway:  ${GATEWAY_URL}`);
  console.log(`  Account:  ${ACCOUNT_ID}`);
  console.log(`  Creds:    ${CREDS_FILE}`);
  console.log();

  // ── Load credentials ─────────────────────────────────────────────────
  const { secretKey, publicKey } = loadKeypair(CREDS_FILE);
  console.log(`  Key:      ${publicKey.slice(0, 30)}...\n`);

  // ── Init SDK (JWT mode for write operations) ─────────────────────────
  const os = new OnSocial({ gatewayUrl: GATEWAY_URL, network: 'testnet' });

  // Track per-step success for the pipeline summary
  let authOk = false;
  let profileOk = false;
  let readOk = false;
  let standOk = false;
  let reactOk = false;
  let unreactOk = false;
  let unstandOk = false;
  let revokeOk = false;

  // ════════════════════════════════════════════════════════════════════════
  // 1. AUTH — challenge-based NEP-413 login
  // ════════════════════════════════════════════════════════════════════════
  console.log('[1/14] Auth — challenge + login');
  try {
    const challengeRes = await os.http.post<{
      challenge: { message: string; recipient: string; nonce: string };
    }>('/auth/challenge', { accountId: ACCOUNT_ID });

    const { message, recipient, nonce } = challengeRes.challenge;
    ok('challenge()', `nonce=${nonce.slice(0, 20)}...`);

    const signature = signNep413(message, nonce, recipient, secretKey);

    const loginResult = await os.auth.login({
      accountId: ACCOUNT_ID,
      message,
      signature,
      publicKey,
    });
    ok('login()', `tier=${loginResult.tier}, expires=${loginResult.expiresIn}`);
    authOk = true;
  } catch (e: unknown) {
    fail('login()', e);
    console.log('\n  ⛔ Cannot proceed without auth. Exiting.\n');
    process.exit(1);
  }

  // ════════════════════════════════════════════════════════════════════════
  // 2. ONAPI KEY — create a developer API key
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n[2/14] OnAPI — create developer key');
  let apiKey: string | null = null;
  try {
    const keyResult = await os.http.post<{
      key: string;
      prefix: string;
      label: string;
      tier: string;
    }>('/developer/keys', { label: 'sdk-live-test' });
    apiKey = keyResult.key;
    ok('createKey()', `prefix=${keyResult.prefix}, tier=${keyResult.tier}`);
  } catch (e) {
    fail('createKey()', e);
  }

  // ════════════════════════════════════════════════════════════════════════
  // 3. STORAGE — upload media to IPFS via gateway
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n[3/14] Storage — upload media to IPFS');
  let mediaCid: string | null = null;
  try {
    // Create a small test image (1x1 red PNG)
    const PNG_1x1 = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
      'base64'
    );
    const file = new Blob([PNG_1x1], { type: 'image/png' });
    const { cid } = await os.storage.upload(file);
    mediaCid = cid;
    const url = os.storage.url(cid);
    ok('upload()', `cid=${cid.slice(0, 20)}...`);
    ok('url()', url);
  } catch (e) {
    fail('upload()', e);
  }

  // ════════════════════════════════════════════════════════════════════════
  // 4. SOCIAL POST — on-chain write with media + hashtags, gasless via relay
  // ════════════════════════════════════════════════════════════════════════
  console.log(
    '\n[4/14] Social — post with media + hashtags (gasless on-chain write)'
  );
  let postTxHash: string | undefined;
  const postId = String(Date.now());
  try {
    const media: string[] = mediaCid ? [`ipfs://${mediaCid}`] : [];
    const result = await os.social.post(
      {
        text: `Full pipeline test at ${new Date().toISOString()} #onsocial #sdktest`,
        media,
        hashtags: ['onsocial', 'sdktest'],
      },
      postId
    );
    postTxHash = result.txHash;
    ok('post()', `txHash=${result.txHash?.slice(0, 20)}... postId=${postId}`);
    if (media.length > 0) {
      ok('  media attached', media[0]);
    }
    ok('  hashtags', 'onsocial, sdktest');
  } catch (e) {
    fail('post()', e);
  }

  // ════════════════════════════════════════════════════════════════════════
  // 5. SOCIAL PROFILE — on-chain write, gasless
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n[5/14] Social — write profile (gasless on-chain write)');
  try {
    const ts = Date.now();
    const result = await os.social.setProfile({
      name: `SDK Test ${ts}`,
      bio: `Full pipeline at ${new Date(ts).toISOString()}`,
    });
    ok('setProfile()', `txHash=${result.txHash?.slice(0, 20)}...`);
    profileOk = true;
  } catch (e) {
    fail('setProfile()', e);
  }

  // ════════════════════════════════════════════════════════════════════════
  // 6. CONTRACT READ — read back profile from on-chain (RPC view call)
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n[6/14] Data — read profile from contract (RPC view)');
  try {
    const entry = await os.social.getOne(`${ACCOUNT_ID}/profile/name`);
    ok('getOne()', `value=${JSON.stringify(entry?.value)?.slice(0, 60)}`);
    readOk = true;
  } catch (e) {
    fail('getOne()', e);
  }

  // ════════════════════════════════════════════════════════════════════════
  // 7. STAND WITH — social graph write, gasless
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n[7/14] Social — standWith (gasless on-chain write)');
  try {
    const result = await os.social.standWith('onsocial.testnet');
    ok('standWith()', `txHash=${result.txHash?.slice(0, 20)}...`);
    standOk = true;
  } catch (e) {
    fail('standWith()', e);
  }

  // ════════════════════════════════════════════════════════════════════════
  // 8. REACT — reaction write, gasless
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n[8/14] Social — react to post (gasless on-chain write)');
  try {
    const result = await os.social.react(ACCOUNT_ID, `post/${postId}`, {
      type: 'like',
    });
    ok('react()', `txHash=${result.txHash?.slice(0, 20)}...`);
    reactOk = true;
  } catch (e) {
    fail('react()', e);
  }

  // ════════════════════════════════════════════════════════════════════════
  // 9. MINT POST — social commerce: mint post as collectible scarce
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n[9/14] Commerce — mintPost (post → scarce NFT)');
  let mintResult: Awaited<ReturnType<typeof os.mintPost>> | null = null;
  try {
    mintResult = await os.mintPost(ACCOUNT_ID, postId, {
      royalty: { [ACCOUNT_ID]: 1000 }, // 10%
    });
    ok('mintPost()', `txHash=${mintResult.mint.txHash?.slice(0, 20)}...`);
  } catch (e) {
    fail('mintPost()', e);
  }

  // ════════════════════════════════════════════════════════════════════════
  // 10. ONAPI QUERY — use API key to query indexed data
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n[10/14] OnAPI Query — read indexed data via API key');
  if (apiKey) {
    const osApi = new OnSocial({
      gatewayUrl: GATEWAY_URL,
      network: 'testnet',
      apiKey,
    });
    try {
      const page = await osApi.query.getPosts({ author: ACCOUNT_ID, limit: 5 });
      ok('getPosts() [apiKey]', `${page.items.length} posts indexed`);
    } catch (e) {
      fail('getPosts() [apiKey]', e);
    }
    try {
      const profile = await osApi.query.getProfile(ACCOUNT_ID);
      if (profile) {
        ok(
          'getProfile() [apiKey]',
          `fields=[${Object.keys(profile).join(', ')}]`
        );
      } else {
        ok(
          'getProfile() [apiKey]',
          'null (not indexed yet — substreams may need time)'
        );
      }
    } catch (e) {
      fail('getProfile() [apiKey]', e);
    }
    try {
      const counts = await osApi.query.getStandingCounts(ACCOUNT_ID);
      ok(
        'getStandingCounts() [apiKey]',
        `standers=${counts.standers}, standingWith=${counts.standingWith}`
      );
    } catch (e) {
      fail('getStandingCounts() [apiKey]', e);
    }
  } else {
    console.log('  ⏭️  Skipped — no API key available');
  }

  // ════════════════════════════════════════════════════════════════════════
  // 11. STORAGE READ — verify uploaded media is accessible
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n[11/14] Storage — verify media accessible');
  if (mediaCid) {
    try {
      const url = os.storage.url(mediaCid);
      const res = await fetch(url, { method: 'HEAD' });
      if (res.ok) {
        ok(
          'media accessible',
          `${url} → ${res.status} ${res.headers.get('content-type')}`
        );
      } else {
        fail('media accessible', { message: `${url} → ${res.status}` });
      }
    } catch (e) {
      fail('media accessible', e);
    }
  } else {
    console.log('  ⏭️  Skipped — no media CID');
  }

  // ════════════════════════════════════════════════════════════════════════
  // 12. CLEANUP — revoke the test API key
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n[12/14] Cleanup — revoke test API key');
  if (apiKey) {
    try {
      const { keys } = await os.http.get<{
        keys: Array<{ prefix: string; label: string }>;
      }>('/developer/keys');
      const testKey = keys.find((k) => k.label === 'sdk-live-test');
      if (testKey) {
        await os.http.delete(`/developer/keys/${testKey.prefix}`);
        ok('revokeKey()', `prefix=${testKey.prefix}`);
      } else {
        ok('revokeKey()', 'key not found in list (may already be cleaned up)');
      }
      revokeOk = true;
    } catch (e) {
      fail('revokeKey()', e);
    }
  } else {
    console.log('  ⏭️  Skipped — no key to revoke');
  }

  // ════════════════════════════════════════════════════════════════════════
  // 13. CLEANUP — undo react + unstand
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n[13/14] Cleanup — undo react + unstand');
  try {
    await os.social.unreact(ACCOUNT_ID, 'like', `post/${postId}`);
    ok('unreact()', 'removed like');
    unreactOk = true;
  } catch (e) {
    fail('unreact()', e);
  }
  try {
    await os.social.unstand('onsocial.testnet');
    ok('unstand()', 'removed standing');
    unstandOk = true;
  } catch (e) {
    fail('unstand()', e);
  }

  console.log('\n[14/14] Pipeline verification');
  const pipeline = [
    ['Auth (NEP-413 challenge)', authOk],
    ['OnAPI key (create)', !!apiKey],
    ['Storage (IPFS upload)', !!mediaCid],
    ['Post with media + hashtags (gasless relay)', !!postTxHash],
    ['Profile write (gasless relay)', profileOk],
    ['On-chain read (RPC view)', readOk],
    ['StandWith (social graph)', standOk],
    ['React to post', reactOk],
    ['MintPost (social commerce)', !!mintResult],
    ['Indexed query (Hasura via apiKey)', !!apiKey],
    ['Media verification', !!mediaCid],
    ['Cleanup: revoke API key', revokeOk || !apiKey],
    ['Cleanup: unreact', unreactOk],
    ['Cleanup: unstand', unstandOk],
  ] as const;
  for (const [label, didRun] of pipeline) {
    console.log(`  ${didRun ? '✅' : '⚠️ '} ${label}`);
  }

  // ── Summary ──────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('═'.repeat(60));

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('\nFatal:', err);
  process.exit(1);
});
