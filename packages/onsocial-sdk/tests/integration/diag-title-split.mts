// ---------------------------------------------------------------------------
// Diagnostic: verify the new deriveTitle / smart-description split end-to-end.
//
// We mint scarces from three freshly created posts, each WITHOUT passing
// `opts.title` so the SDK's deriveTitle helper actually runs. We then read
// nft_token back from the contract and print title + description so we can
// eyeball the result and click through to the wallet inspectors.
//
// Cases:
//   A. short text                     → title === text, description omitted
//   B. multi-sentence text            → title = first sentence, description = full
//   C. long unbroken text             → title truncated to 80 chars + ellipsis
//
// Usage:
//   pnpm --filter @onsocial/sdk diag:title-split
//
// Env (same defaults as diag:cards):
//   GATEWAY_URL   default https://testnet.onsocial.id
//   ACCOUNT_ID    default test02.onsocial.testnet  (avoid Meteor's ~100-NFT cap)
//   CREDS_FILE    default ~/.near-credentials/testnet/<ACCOUNT_ID>.json
//   RPC_URL       default https://rpc.testnet.fastnear.com
// ---------------------------------------------------------------------------

import {
  ACCOUNT_ID,
  GATEWAY_URL,
  getSessionClient,
} from './helpers.js';
import type { MintResponse } from '../../src/types.js';
import type { OnSocial } from '../../src/client.js';

const RPC_URL = process.env.RPC_URL ?? 'https://rpc.testnet.fastnear.com';
const NETWORK: 'testnet' | 'mainnet' = GATEWAY_URL.includes('testnet')
  ? 'testnet'
  : 'mainnet';
const CONTRACT =
  NETWORK === 'mainnet' ? 'scarces.onsocial.near' : 'scarces.onsocial.testnet';

const RUN_ID = Math.floor(Date.now() / 1000)
  .toString(36)
  .slice(-5);

interface Case {
  n: number;
  label: string;
  text: string;
  expectTitle: (text: string) => string;
  expectDescriptionDropped: boolean;
}

const TITLE_MAX = 80;
function deriveTitleRef(text: string): string {
  const t = text.trim();
  if (!t) return '';
  const firstLine = t.split(/\r?\n/)[0]!.trim();
  const firstSentence = firstLine.split(/(?<=[.!?])\s+/)[0]!.trim();
  if (firstSentence && firstSentence.length < t.length && firstSentence.length <= TITLE_MAX) {
    return firstSentence;
  }
  if (firstLine && firstLine.length < t.length && firstLine.length <= TITLE_MAX) {
    return firstLine;
  }
  if (t.length <= TITLE_MAX) return t;
  const window = t.slice(0, TITLE_MAX);
  const lastSpace = window.lastIndexOf(' ');
  if (lastSpace >= TITLE_MAX / 2) return window.slice(0, lastSpace).trimEnd();
  return window.trimEnd();
}

const CASES: Case[] = [
  {
    n: 1,
    label: 'short text → title === text, description dropped',
    text: `Just shipped [${RUN_ID}]`,
    expectTitle: (t) => t,
    expectDescriptionDropped: true,
  },
  {
    n: 2,
    label: 'sentence + tag → title = sentence, description = full text',
    text: `Just shipped. [${RUN_ID}]`,
    expectTitle: () => 'Just shipped.',
    expectDescriptionDropped: false,
  },
  {
    n: 3,
    label: 'multi-sentence → title = first sentence, description = full',
    text:
      `Shipped v2 of the relayer [${RUN_ID}]. ` +
      `Three months of grinding paid off. Demo at 5pm.`,
    expectTitle: (t) => t.split(/(?<=[.!?])\s+/)[0]!,
    expectDescriptionDropped: false,
  },
  {
    n: 4,
    label: 'long unbroken → title hard-cut at 80 chars (no ellipsis)',
    text: `headline-${RUN_ID}-` + 'x'.repeat(200),
    expectTitle: (t) => t.slice(0, TITLE_MAX),
    expectDescriptionDropped: false,
  },
  {
    n: 5,
    label: 'long with spaces → title cut on word boundary',
    text:
      `Update ${RUN_ID}: this is a long single sentence with several words ` +
      `that runs well past the eighty character limit so we expect a clean ` +
      `word-boundary cut`,
    expectTitle: (t) => {
      const w = t.slice(0, TITLE_MAX);
      const i = w.lastIndexOf(' ');
      return i >= TITLE_MAX / 2 ? w.slice(0, i).trimEnd() : w.trimEnd();
    },
    expectDescriptionDropped: false,
  },
];

function pickTokenId(res: MintResponse): string | undefined {
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

interface RpcReceiptLog {
  outcome?: { logs?: string[] };
}
interface RpcTxStatus {
  result?: {
    receipts_outcome?: RpcReceiptLog[];
    transaction_outcome?: RpcReceiptLog;
  };
  error?: unknown;
}

async function tokenIdFromTxLogs(
  txHash: string,
  signerId: string
): Promise<string | undefined> {
  // NEP-171 emits `EVENT_JSON:{"standard":"nep171","event":"nft_mint",
  // "data":[{"owner_id":"...","token_ids":["<id>"]}]}` on the contract
  // receipt. Poll briefly because tx propagation isn't instant.
  for (let i = 0; i < 6; i++) {
    const body = {
      jsonrpc: '2.0',
      id: 'diag-tx',
      method: 'tx',
      params: [txHash, signerId],
    };
    const resp = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (resp.ok) {
      const json = (await resp.json()) as RpcTxStatus;
      if (!json.error && json.result) {
        const allLogs: string[] = [];
        for (const r of json.result.receipts_outcome ?? []) {
          for (const log of r.outcome?.logs ?? []) allLogs.push(log);
        }
        for (const log of allLogs) {
          if (!log.startsWith('EVENT_JSON:')) continue;
          try {
            const ev = JSON.parse(log.slice('EVENT_JSON:'.length)) as {
              event?: string;
              data?: Array<{ token_ids?: string[] }>;
            };
            if (ev.event === 'nft_mint') {
              const id = ev.data?.[0]?.token_ids?.[0];
              if (id) return id;
            }
          } catch {
            // ignore malformed log lines
          }
        }
      }
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return undefined;
}

interface NftTokenMeta {
  title?: string | null;
  description?: string | null;
}
interface NftToken {
  token_id: string;
  metadata?: NftTokenMeta;
}

async function readNftToken(tokenId: string): Promise<NftToken | null> {
  const args = Buffer.from(JSON.stringify({ token_id: tokenId })).toString('base64');
  const body = {
    jsonrpc: '2.0',
    id: 'diag',
    method: 'query',
    params: {
      request_type: 'call_function',
      finality: 'final',
      account_id: CONTRACT,
      method_name: 'nft_token',
      args_base64: args,
    },
  };
  // RPC nodes can lag a block or two behind tx finality; retry briefly.
  for (let i = 0; i < 5; i++) {
    const res = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const json = (await res.json()) as {
        result?: { result?: number[] };
        error?: unknown;
      };
      if (!json.error) {
        const bytes = json.result?.result;
        if (bytes && bytes.length > 0) {
          const text = Buffer.from(bytes).toString('utf8');
          const tok = JSON.parse(text) as NftToken;
          if (tok?.metadata?.title != null) return tok;
        }
      }
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return null;
}

function preview(s: string | null | undefined, max = 90): string {
  if (s == null) return '<null>';
  const flat = s.replace(/\n/g, '\\n');
  return flat.length > max ? flat.slice(0, max - 1) + '…' : flat;
}

async function runCase(sdk: OnSocial, c: Case): Promise<boolean> {
  console.log(`[${c.n}] ${c.label}`);
  console.log(`    text:           ${preview(c.text)}`);

  const postId = `diag-title-${c.n}-${Date.now()}`;
  await sdk.social.post({ text: c.text, hashtags: ['diag', 'title-split'] }, postId);
  console.log(`    postId:         ${postId}`);

  // No `opts.title` — exercise deriveTitle on the real text.
  const res = await sdk.scarces.fromPost.mint({ author: ACCOUNT_ID, postId });

  const tokenId =
    pickTokenId(res) ?? (await tokenIdFromTxLogs(res.txHash ?? '', ACCOUNT_ID));
  console.log(`    txHash:         ${res.txHash}`);
  console.log(`    tokenId:        ${tokenId ?? '<none>'}`);
  if (!tokenId) {
    console.log('    ❌ no tokenId surfaced — cannot verify');
    return false;
  }

  const token = await readNftToken(tokenId);
  const got = token?.metadata ?? {};
  const expectedTitle = c.expectTitle(c.text);
  const titleOk = got.title === expectedTitle;
  const descDropped = got.description == null || got.description === '';
  const descOk = c.expectDescriptionDropped ? descDropped : !descDropped;

  console.log(`    on-chain title: ${preview(got.title)}`);
  console.log(`    expected title: ${preview(expectedTitle)}`);
  console.log(`    title match:    ${titleOk ? '✅' : '❌'}`);
  console.log(`    on-chain desc:  ${preview(got.description)}`);
  console.log(
    `    desc behavior:  ${descOk ? '✅' : '❌'} (expected ${
      c.expectDescriptionDropped ? 'dropped' : 'present'
    })`
  );
  console.log(`    nearblocks:     https://${NETWORK === 'mainnet' ? '' : 'testnet.'}nearblocks.io/nft/${CONTRACT}/${tokenId}`);
  console.log(
    `    mynearwallet:   https://${NETWORK === 'mainnet' ? 'app' : 'testnet'}.mynearwallet.com/?tab=collectibles`
  );
  console.log();

  return titleOk && descOk;
}

async function main() {
  console.log('═'.repeat(72));
  console.log('  Diag: title / description split (deriveTitle on-chain)');
  console.log('═'.repeat(72));
  console.log(`  Gateway:  ${GATEWAY_URL}`);
  console.log(`  Account:  ${ACCOUNT_ID}`);
  console.log(`  Contract: ${CONTRACT}`);
  console.log(`  RPC:      ${RPC_URL}`);
  console.log(`  Run ID:   ${RUN_ID}`);
  console.log();

  const sdk = await getSessionClient();

  let passed = 0;
  let failed = 0;
  for (const c of CASES) {
    try {
      if (await runCase(sdk, c)) passed++;
      else failed++;
    } catch (e) {
      failed++;
      console.log(`    ❌ ${(e as Error).message}\n`);
    }
  }

  console.log('═'.repeat(72));
  console.log(`  Done: ${passed} ok, ${failed} failed`);
  console.log('═'.repeat(72));
  // Reference deriveTitleRef so tsc/eslint don't complain about the
  // local copy being unused — it's there as living documentation.
  void deriveTitleRef;
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
