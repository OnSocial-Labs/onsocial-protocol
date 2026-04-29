// ---------------------------------------------------------------------------
// Diagnostic: mint scarces from a freshly created post in 5 modes and
// inspect what the gateway returns. Use this after a deployment to verify
// that the cards render in real wallets (Bitte / Meteor / MyNearWallet).
//
// Storage matrix this script exercises:
//
//   1. mint(), no photo, no skipAutoMedia       → SVG inlined as data:image/svg+xml on-chain (true on-chain art)
//   2. mint(), post has photo (default)         → photo CID via IPFS gateway
//   3. mintReceipt({palette:'light'}) + photo   → SVG uploaded to Lighthouse; photo embedded as data: inside SVG
//   4. mintReceipt({palette:'noir'})  + photo   → SVG uploaded to Lighthouse; photo embedded as data: inside SVG
//
// For each mint, we:
//   • print the txHash + media URL
//   • if media is an https://… URL    → GET the bytes; if SVG, save to /tmp
//   • print Bitte / MyNearWallet inspector URLs for the resulting tokenId
//
// Usage:
//   pnpm --filter @onsocial/sdk diag:cards
//
// Env:
//   GATEWAY_URL   default https://testnet.onsocial.id
//   ACCOUNT_ID    default test01.onsocial.testnet
//   CREDS_FILE    default ~/.near-credentials/testnet/<ACCOUNT_ID>.json
//   OPEN=1        also `xdg-open` each generated /tmp svg
//   ONLY=1,3,5    only run these mode numbers
// ---------------------------------------------------------------------------

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os_node from 'node:os';
import { execFileSync } from 'node:child_process';
import {
  ACCOUNT_ID,
  GATEWAY_URL,
  getSessionClient,
} from './helpers.js';
import { makeSolidPng } from './diag-png.js';
import type { MintResponse } from '../../src/types.js';
import type { OnSocial } from '../../src/client.js';

// 256×256 magenta PNG — large enough to actually be visible in wallet
// thumbnails so mode 2 (photo cover) doesn't show as a single pixel.
// Modes 4/5 also embed this so receipts have a real visible proof block.
const PHOTO_PNG = makeSolidPng(256, [0xff, 0x00, 0x99]);

// Per-run identifier, propagated into every mint title so a wallet view
// after multiple diag runs immediately reveals which mints came from
// which run. Format: 5-char base36 (~e.g. "k3xz9").
const RUN_ID = Math.floor(Date.now() / 1000)
  .toString(36)
  .slice(-5);

const OUT_DIR = fs.mkdtempSync(path.join(os_node.tmpdir(), 'diag-cards-'));
const OPEN = process.env.OPEN === '1';
const ONLY = (process.env.ONLY ?? '')
  .split(',')
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0);

interface Mode {
  n: number;
  label: string;
  run(os: OnSocial, ctx: Ctx): Promise<MintResponse>;
}

interface Ctx {
  /** Post WITHOUT a photo — used by mode 1 to exercise the on-chain data: SVG path. */
  textPostId: string;
  /** Post WITH a photo — used by modes 2–5. */
  postId: string;
  mediaCid: string;
}

const MODES: Mode[] = [
  {
    n: 1,
    label: 'mint() text-only post → data: SVG on-chain',
    run: (os, { textPostId }) =>
      os.scarces.fromPost.mint(
        { author: ACCOUNT_ID, postId: textPostId },
        {
          title: `Diag #1/${RUN_ID} — text-only auto-card`,
          cardBg: 'serif-night',
        }
      ),
  },
  {
    n: 2,
    label: 'mint() default with post photo → IPFS cover',
    run: (os, { postId }) =>
      os.scarces.fromPost.mint(
        { author: ACCOUNT_ID, postId },
        { title: `Diag #2/${RUN_ID} — photo cover (default)` }
      ),
  },
  {
    n: 3,
    label: "mintReceipt({palette:'light'}) → inline receipt SVG with photo proof",
    run: (os, { postId }) =>
      os.scarces.fromPost.mintReceipt(
        { author: ACCOUNT_ID, postId },
        { title: `Diag #3/${RUN_ID} — Receipt: shipped.`, palette: 'light' }
      ),
  },
  {
    n: 4,
    label: "mintReceipt({palette:'noir'}) → inline receipt SVG with photo proof",
    run: (os, { postId }) =>
      os.scarces.fromPost.mintReceipt(
        { author: ACCOUNT_ID, postId },
        { title: `Diag #4/${RUN_ID} — Receipt: sold out.`, palette: 'noir' }
      ),
  },
];

function shorten(s: string | undefined, n = 20): string {
  if (!s) return '<none>';
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

async function describeMedia(
  modeNum: number,
  url: string | undefined
): Promise<void> {
  if (!url) {
    console.log('     media.url: <missing>');
    return;
  }
  if (url.startsWith('data:image/svg+xml;base64,')) {
    const b64 = url.slice('data:image/svg+xml;base64,'.length);
    const svg = Buffer.from(b64, 'base64').toString('utf8');
    const file = path.join(OUT_DIR, `mode-${modeNum}.svg`);
    fs.writeFileSync(file, svg);
    const hasPhoto = /<image\s[^>]*href="data:image\/[^"]+"/.test(svg);
    console.log(`     media: data:URI (${b64.length} b64 chars, ${svg.length} bytes svg)`);
    console.log(`            saved → ${file}`);
    console.log(`            embeds inline photo? ${hasPhoto ? 'yes' : 'no'}`);
    if (OPEN) {
      try {
        execFileSync('xdg-open', [file], { stdio: 'ignore' });
      } catch {
        /* ignore */
      }
    }
  } else if (url.startsWith('http://') || url.startsWith('https://')) {
    console.log(`     media: ${url}`);
    try {
      const res = await fetch(url);
      const ct = res.headers.get('content-type') ?? '?';
      console.log(`            GET ${res.status} ${res.statusText} content-type=${ct}`);
      if (res.ok && ct.includes('svg')) {
        const svg = await res.text();
        const file = path.join(OUT_DIR, `mode-${modeNum}.svg`);
        fs.writeFileSync(file, svg);
        const hasPhoto = /<image\s[^>]*href="data:image\/[^"]+"/.test(svg);
        console.log(`            saved → ${file} (${svg.length} bytes)`);
        console.log(`            embeds inline photo? ${hasPhoto ? 'yes' : 'no'}`);
        if (OPEN) {
          try {
            execFileSync('xdg-open', [file], { stdio: 'ignore' });
          } catch {
            /* ignore */
          }
        }
      }
    } catch (e) {
      console.log(`            GET failed: ${(e as Error).message}`);
    }
  } else {
    console.log(`     media (unknown scheme): ${url.slice(0, 80)}…`);
  }
}

function walletUrls(tokenId: string | undefined, network: 'testnet' | 'mainnet') {
  if (!tokenId) return;
  const contract = network === 'mainnet' ? 'scarces.onsocial.near' : 'scarces.onsocial.testnet';
  console.log(`     bitte:    https://wallet.bitte.ai/asset/${contract}/${tokenId}`);
  console.log(`     mintbase: https://www.mintbase.xyz/${network}/meta/${contract}:${tokenId}`);
}

function pickTokenId(res: MintResponse): string | undefined {
  // The gateway surfaces tokenId in a few possible shapes — try the
  // common ones rather than guessing a single field.
  const r = res as unknown as Record<string, unknown>;
  if (typeof r.tokenId === 'string') return r.tokenId;
  if (typeof r.token_id === 'string') return r.token_id;
  const raw = r.raw as Record<string, unknown> | undefined;
  if (raw) {
    if (typeof raw.tokenId === 'string') return raw.tokenId;
    if (typeof raw.token_id === 'string') return raw.token_id;
  }
  return undefined;
}

async function main() {
  console.log('═'.repeat(72));
  console.log('  Diag: mint cards from a fresh post');
  console.log('═'.repeat(72));
  console.log(`  Gateway:   ${GATEWAY_URL}`);
  console.log(`  Account:   ${ACCOUNT_ID}`);
  console.log(`  Run ID:    ${RUN_ID}  (titles: Diag #N/${RUN_ID})`);
  console.log(`  Output:    ${OUT_DIR}`);
  console.log(`  Modes:     ${ONLY.length ? ONLY.join(',') : 'all (1-4)'}`);
  console.log();

  const network: 'testnet' | 'mainnet' = GATEWAY_URL.includes('testnet')
    ? 'testnet'
    : 'mainnet';
  const sdk = await getSessionClient();

  // ── 0. Upload a photo + create both source posts ────────────────────
  console.log('[0] upload photo + create source posts (text-only + with-photo)');
  const file = new Blob([new Uint8Array(PHOTO_PNG)], { type: 'image/png' });
  const { cid: photoCid } = await sdk.storage.upload(file);
  console.log(`    photoCid:    ${photoCid}`);

  // Mode 1 needs a post WITHOUT a photo so the gateway falls through
  // to the text-only data: URI path. Post with photo is used by 2–5.
  const textPostId = `diag-cards-text-${Date.now()}`;
  await sdk.social.post(
    {
      text: `Diag text-only run @ ${new Date().toISOString()}`,
      hashtags: ['diag'],
    },
    textPostId
  );
  console.log(`    textPostId:  ${textPostId}`);

  const postId = `diag-cards-${Date.now()}`;
  await sdk.social.post(
    {
      text: `Diag mint cards run @ ${new Date().toISOString()}`,
      media: [`ipfs://${photoCid}`],
      hashtags: ['diag'],
    },
    postId
  );
  console.log(`    postId:      ${postId}`);
  console.log();

  const ctx: Ctx = { textPostId, postId, mediaCid: photoCid };
  const modesToRun = ONLY.length ? MODES.filter((m) => ONLY.includes(m.n)) : MODES;

  let passed = 0;
  let failed = 0;
  for (const mode of modesToRun) {
    console.log(`[${mode.n}] ${mode.label}`);
    try {
      const res = await mode.run(sdk, ctx);
      const tokenId = pickTokenId(res);
      console.log(`     txHash:   ${shorten(res.txHash, 24)}`);
      console.log(`     tokenId:  ${tokenId ?? '<not surfaced>'}`);
      console.log(`     metadata: ${res.metadata?.url ?? '<none>'}`);
      await describeMedia(mode.n, res.media?.url);
      walletUrls(tokenId, network);
      passed++;
    } catch (e) {
      failed++;
      console.log(`     ❌ ${(e as Error).message}`);
    }
    console.log();
  }

  console.log('═'.repeat(72));
  console.log(`  Done: ${passed} ok, ${failed} failed.  Artifacts in ${OUT_DIR}`);
  console.log('═'.repeat(72));
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
