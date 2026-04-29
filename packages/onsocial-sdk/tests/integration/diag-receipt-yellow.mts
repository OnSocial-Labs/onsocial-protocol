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
import { execFileSync } from 'node:child_process';
import { ACCOUNT_ID, GATEWAY_URL, getSessionClient } from './helpers.js';
import { makeSolidPng } from './diag-png.js';

// Per-run identifier so the wallet view immediately shows which mint
// belongs to which diag run when you run this script multiple times.
const RUN_ID = Math.floor(Date.now() / 1000)
  .toString(36)
  .slice(-5);

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
  console.log(`  Run ID:  ${RUN_ID}  (title: Yellow #${RUN_ID})`);
  console.log(`  Output:  ${OUT}`);
  console.log();

  const sdk = await getSessionClient();

  // ── 1. Upload the yellow PNG ────────────────────────────────────────
  console.log('[1] upload yellow.png to Lighthouse via gateway');
  const png = makeSolidPng(64, [0xff, 0xd6, 0x00]);
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
    { title: `Yellow #${RUN_ID} \u2014 Shipped.`, palette: 'noir' }
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

  // ── 5. Verify the SVG actually embeds OUR yellow bytes ─────────────
  // Photos are inlined as `data:image/png;base64,...` inside the SVG so
  // wallets render them via `<img>` without cross-origin blocking. We
  // verify byte-for-byte equality against the PNG we uploaded in step 1.
  console.log('[5] verify SVG embeds the yellow photo as inline data: URI');
  const m = svg.match(/<image[^>]*href="([^"]+)"/);
  if (!m) {
    console.error('    ❌ no <image> tag in SVG');
    process.exit(1);
  }
  const href = m[1];
  console.log(`    href prefix: ${href.slice(0, 48)}…`);
  const dataMatch = href.match(/^data:image\/[a-z+]+;base64,(.+)$/);
  if (!dataMatch) {
    console.error('    ❌ embedded photo is not a data:image base64 URI');
    process.exit(1);
  }
  const embeddedBytes = Buffer.from(dataMatch[1], 'base64');
  if (
    embeddedBytes.length !== png.length ||
    !embeddedBytes.equals(Buffer.from(png))
  ) {
    console.error(
      `    ❌ embedded bytes (${embeddedBytes.length}) don't match yellow PNG (${png.length})`
    );
    process.exit(1);
  }
  console.log(
    `    ✅ ${embeddedBytes.length} bytes match the source yellow.png byte-for-byte.`
  );
  console.log();

  // ── 6. Verify metadata.json carries the photoCid for content-addressability ──
  console.log('[6] verify metadata.json carries extra.theme.photoCid for indexers');
  const metaUrl = res.metadata?.url ?? '';
  let photoCidOk = false;
  if (metaUrl) {
    const metaRes = await fetch(metaUrl);
    if (metaRes.ok) {
      const meta = (await metaRes.json()) as {
        extra?: string | { theme?: { photoCid?: string } };
      };
      // `extra` may be a JSON string (contract-stringified) or an object.
      const extraObj =
        typeof meta.extra === 'string' ? JSON.parse(meta.extra) : meta.extra;
      const photoCid = extraObj?.theme?.photoCid;
      console.log(`    photoCid: ${photoCid ?? '<missing>'}`);
      if (photoCid === cid) {
        console.log('    ✅ metadata records the original Lighthouse CID.');
        photoCidOk = true;
      } else {
        console.error(`    ❌ metadata photoCid does not match (${cid})`);
      }
    } else {
      console.error(`    ❌ GET ${metaUrl} → ${metaRes.status}`);
    }
  }
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
    `  ${photoCidOk ? '✅ Pass' : '❌ Fail'} — open ${svgPath} in a browser to confirm you see a yellow square in the dark card`
  );
  console.log('═'.repeat(72));
  process.exit(photoCidOk ? 0 : 1);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
