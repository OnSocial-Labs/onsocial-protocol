// ---------------------------------------------------------------------------
// Quick visual proof: mint a receipt scarce with a vivid YELLOW photo so it's
// obvious by-eye whether the photo round-trips correctly through Lighthouse +
// the receipt SVG's <image href> tag.
//
// What it verifies end-to-end:
//   1. yellow PNG → uploadToLighthouse()           (fresh CID we can probe)
//   2. post made on-chain with media: ipfs://<cid>
//   3. mintReceipt({palette:'noir'})               (dark background — yellow pops)
//   4. SVG returned in media as https://cdn…/ipfs/<svgCid> (uploaded to Lighthouse)
//   5. SVG embeds <image href="https://cdn…/ipfs/<cid>">  (pointing at #1)
//   6. CID resolves on cdn.onsocial.id, gateway.lighthouse.storage, dweb.link
//
// The output SVG is saved to /tmp so you can open it in a browser and confirm
// you see a yellow square inset in the dark receipt card. If the yellow shows
// up, every link in the chain is intact.
//
// Usage:
//   pnpm --filter @onsocial/sdk diag:receipt
// ---------------------------------------------------------------------------

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os_node from 'node:os';
import * as zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { ACCOUNT_ID, GATEWAY_URL, getSessionClient } from './helpers.js';

// Generate a 64×64 vivid yellow PNG (#FFD600) inline. Using a generated
// buffer (not a hard-coded base64 string) so we can't accidentally ship a
// truncated literal that fails to decode.
const CRC32_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC32_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function makeYellowPng(size = 64): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
    return Buffer.concat([len, t, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 8-bit
  ihdr[9] = 2; // RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  // Each row: filter byte (0=None) + RGB triples for each pixel.
  const row = Buffer.alloc(1 + size * 3);
  for (let x = 0; x < size; x++) {
    row[1 + x * 3 + 0] = 0xff;
    row[1 + x * 3 + 1] = 0xd6;
    row[1 + x * 3 + 2] = 0x00;
  }
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const OPEN = process.env.OPEN === '1';
const OUT = fs.mkdtempSync(path.join(os_node.tmpdir(), 'diag-receipt-'));

async function probe(label: string, url: string) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    console.log(
      `   ${label.padEnd(32)} ${res.status} ${res.statusText} ${res.headers.get('content-type') ?? ''} ${res.headers.get('content-length') ?? ''}`
    );
    return res.ok;
  } catch (e) {
    console.log(`   ${label.padEnd(32)} ❌ ${(e as Error).message}`);
    return false;
  }
}

async function main() {
  console.log('═'.repeat(72));
  console.log('  Diag: receipt mint with YELLOW proof photo');
  console.log('═'.repeat(72));
  console.log(`  Gateway: ${GATEWAY_URL}`);
  console.log(`  Account: ${ACCOUNT_ID}`);
  console.log(`  Output:  ${OUT}`);
  console.log();

  const sdk = await getSessionClient();

  // ── 1. Upload the yellow PNG ────────────────────────────────────────
  console.log('[1] upload yellow.png to Lighthouse via gateway');
  const png = makeYellowPng(64);
  fs.writeFileSync(path.join(OUT, 'source-yellow.png'), png);
  const blob = new Blob([new Uint8Array(png)], { type: 'image/png' });
  const { cid } = await sdk.storage.upload(blob);
  console.log(`    bytes: ${png.length}  cid: ${cid}`);
  console.log();

  // ── 2. Probe the CID across 3 gateways ──────────────────────────────
  console.log('[2] probe yellow CID across gateways (Lighthouse pin proof)');
  const cdnUrl = `https://cdn.testnet.onsocial.id/ipfs/${cid}`;
  await probe('cdn.testnet.onsocial.id', cdnUrl);
  await probe('gateway.lighthouse.storage', `https://gateway.lighthouse.storage/ipfs/${cid}`);
  await probe('ipfs.dweb.link', `https://${cid}.ipfs.dweb.link/`);
  console.log();

  // ── 3. Create a post with that media (so fromPost.mintReceipt has a photo) ──
  const postId = `diag-receipt-yellow-${Date.now()}`;
  console.log(`[3] create post (id=${postId}) with the yellow photo as media`);
  await sdk.social.post(
    {
      text: `Yellow receipt diag @ ${new Date().toISOString()}`,
      media: [`ipfs://${cid}`],
      hashtags: ['diag'],
    },
    postId
  );
  console.log('    posted.');
  console.log();

  // ── 4. Mint as receipt (noir = dark bg → yellow stands out) ────────
  console.log('[4] mintReceipt({ palette: "noir" }) — yellow proof on dark bg');
  const res = await sdk.scarces.fromPost.mintReceipt(
    { author: ACCOUNT_ID, postId },
    { title: 'Yellow proof. Shipped.', palette: 'noir' }
  );
  console.log(`    txHash:   ${res.txHash}`);
  console.log(`    metadata: ${res.metadata?.url ?? '<none>'}`);
  const mediaUrl = res.media?.url ?? '';
  if (!mediaUrl.startsWith('http://') && !mediaUrl.startsWith('https://')) {
    console.error(`    ❌ expected uploaded SVG URL, got: ${mediaUrl.slice(0, 80)}`);
    process.exit(1);
  }
  console.log(`    media URL: ${mediaUrl}`);
  const fetchRes = await fetch(mediaUrl);
  if (!fetchRes.ok) {
    console.error(`    ❌ GET ${mediaUrl} → ${fetchRes.status}`);
    process.exit(1);
  }
  const svg = await fetchRes.text();
  const svgPath = path.join(OUT, 'receipt-yellow.svg');
  fs.writeFileSync(svgPath, svg);
  console.log(`    saved →  ${svgPath}  (${svg.length} bytes)`);
  console.log();

  // ── 5. Verify the SVG actually embeds OUR yellow CID ────────────────
  console.log('[5] verify SVG embeds the yellow CID via <image href>');
  const m = svg.match(/<image[^>]*href="([^"]+)"/);
  if (!m) {
    console.error('    ❌ no <image> tag in SVG');
    process.exit(1);
  }
  const href = m[1];
  console.log(`    href: ${href}`);
  if (!href.includes(cid)) {
    console.error(`    ❌ href does not reference our uploaded CID (${cid})`);
    process.exit(1);
  }
  console.log('    ✅ SVG references the exact CID we uploaded.');
  console.log();

  // ── 6. Re-probe the embedded URL (what the wallet will fetch) ──────
  console.log('[6] probe the embedded URL (this is what wallets will load)');
  const ok = await probe('embedded href', href);
  console.log();

  if (OPEN) {
    try {
      execFileSync('xdg-open', [svgPath], { stdio: 'ignore' });
    } catch {
      /* ignore */
    }
  }

  console.log('═'.repeat(72));
  console.log(
    `  ${ok ? '✅ Pass' : '❌ Fail'} — open ${svgPath} in a browser to confirm you see a yellow square in the dark card`
  );
  console.log('═'.repeat(72));
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
