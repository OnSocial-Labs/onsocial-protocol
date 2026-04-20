// ---------------------------------------------------------------------------
// OnSocial Pages — Production HTTP server
//
// Runs behind Caddy which handles TLS for *.onsocial.id.
// Caddy forwards the Host header, so we extract the subdomain from that.
//
//   Host: greenghost.onsocial.id → accountId = greenghost.testnet (or .near)
//
// Environment:
//   PORT            — listen port (default 3456)
//   NEAR_RPC_URL    — NEAR RPC endpoint
//   CORE_CONTRACT   — core contract account ID
//   NEAR_NETWORK    — "testnet" or "mainnet" (default: derived from CORE_CONTRACT)
// ---------------------------------------------------------------------------

import http from 'node:http';
import { renderPage } from './renderer.js';
import type { PageData, PageProfile, PageConfig } from './types.js';

const PORT = parseInt(process.env.PORT || '3456', 10);
const RPC_URL = process.env.NEAR_RPC_URL || 'https://rpc.testnet.near.org';
const CORE_CONTRACT = process.env.CORE_CONTRACT || 'core.onsocial.testnet';
const NEAR_NETWORK =
  process.env.NEAR_NETWORK ||
  (CORE_CONTRACT.endsWith('.near') ? 'mainnet' : 'testnet');
const ACCOUNT_SUFFIX = NEAR_NETWORK === 'mainnet' ? '.near' : '.testnet';

const RESERVED_SUBDOMAINS = new Set([
  'www',
  'app',
  'api',
  'portal',
  'testnet',
  'mainnet',
  'staging',
  'admin',
  'mail',
  'smtp',
]);

interface RpcEntry {
  requested_key: string;
  value: unknown;
  deleted?: boolean;
}

async function fetchPageData(accountId: string): Promise<PageData> {
  const keys = [
    'profile/name',
    'profile/bio',
    'profile/avatar',
    'profile/links',
    'profile/tags',
    'page/main',
  ];

  const resp = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'query',
      params: {
        request_type: 'call_function',
        account_id: CORE_CONTRACT,
        method_name: 'get',
        args_base64: Buffer.from(
          JSON.stringify({ keys, account_id: accountId })
        ).toString('base64'),
        finality: 'optimistic',
      },
    }),
    signal: AbortSignal.timeout(10_000),
  });

  const json = (await resp.json()) as {
    result?: { result?: number[] };
    error?: unknown;
  };
  if (!json.result?.result) {
    throw new Error(`RPC error: ${JSON.stringify(json.error ?? json)}`);
  }

  const entries: RpcEntry[] = JSON.parse(
    Buffer.from(json.result.result).toString('utf-8')
  );
  const kv: Record<string, unknown> = {};
  for (const e of entries) {
    if (!e.deleted && e.value != null) kv[e.requested_key] = e.value;
  }

  const parseJson = (v: unknown): unknown => {
    if (typeof v === 'string') {
      try {
        return JSON.parse(v);
      } catch {
        return v;
      }
    }
    return v;
  };

  const profile: PageProfile = {
    name: (kv['profile/name'] as string) ?? undefined,
    bio: (kv['profile/bio'] as string) ?? undefined,
    avatar: (kv['profile/avatar'] as string) ?? undefined,
    links: parseJson(kv['profile/links']) as
      | Array<{ label: string; url: string }>
      | undefined,
    tags: parseJson(kv['profile/tags']) as string[] | undefined,
  };

  let pageConfig: PageConfig = {};
  if (kv['page/main']) {
    const parsed = parseJson(kv['page/main']);
    if (parsed && typeof parsed === 'object') pageConfig = parsed as PageConfig;
  }

  return {
    accountId,
    profile,
    config: pageConfig,
    stats: { standingCount: 0, postCount: 0, badgeCount: 0, groupCount: 0 },
    recentPosts: [],
    badges: [],
  };
}

/**
 * Extract accountId from Host header.
 * "greenghost.onsocial.id" → "greenghost.testnet"
 */
function resolveAccountId(host: string): string | null {
  // Strip port if present
  const hostname = host.split(':')[0];
  const parts = hostname.split('.');

  // Need at least 3 parts: subdomain.onsocial.id
  if (parts.length < 3) return null;

  const subdomain = parts[0];
  if (!subdomain || RESERVED_SUBDOMAINS.has(subdomain)) return null;

  // subdomain could already be a full account ID (greenghost.testnet → no suffix needed)
  if (subdomain.includes('.')) return subdomain;

  return subdomain + ACCOUNT_SUFFIX;
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const host = req.headers.host ?? '';

  // Health check
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', network: NEAR_NETWORK }));
    return;
  }

  // Caddy on-demand TLS permission endpoint
  // Caddy sends ?domain=alice.onsocial.id — return 200 to allow cert issuance
  if (url.pathname === '/caddy-ask') {
    const domain = url.searchParams.get('domain') ?? '';
    const parts = domain.split('.');
    const subdomain = parts.length >= 3 ? parts[0] : null;
    if (subdomain && !RESERVED_SUBDOMAINS.has(subdomain)) {
      res.writeHead(200);
      res.end();
    } else {
      res.writeHead(403);
      res.end();
    }
    return;
  }

  // JSON data endpoint (used by external consumers)
  if (url.pathname === '/data/page') {
    const accountId = url.searchParams.get('accountId');
    if (!accountId) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing accountId' }));
      return;
    }
    try {
      const data = await fetchPageData(accountId);
      res.writeHead(200, {
        'content-type': 'application/json',
        'cache-control': 'public, max-age=30',
      });
      res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          error: err instanceof Error ? err.message : String(err),
        })
      );
    }
    return;
  }

  // Dev mode fallback: ?account= query param
  const devAccount = url.searchParams.get('account');
  const accountId = devAccount || resolveAccountId(host);

  if (!accountId) {
    // Root domain or reserved subdomain → redirect
    res.writeHead(302, { Location: 'https://onsocial.id' });
    res.end();
    return;
  }

  try {
    const data = await fetchPageData(accountId);

    // Smart defaults when no profile is set
    if (!data.profile.name) {
      data.profile.name = accountId.replace(/\.testnet$|\.near$/, '');
    }

    // Dev: allow template override
    const tplOverride = url.searchParams.get('template');
    if (tplOverride) data.config.template = tplOverride;

    // Dev: simulate owner
    const isOwner = url.searchParams.get('edit') === 'true';

    const subdomain = accountId.replace(/\.testnet$|\.near$/, '');
    const requestUrl = `https://${subdomain}.onsocial.id`;
    const html = renderPage(data, requestUrl, {
      isOwner,
      apiUrl: isOwner ? `http://localhost:${PORT}` : 'https://api.onsocial.id',
    });

    res.writeHead(200, {
      'content-type': 'text/html;charset=utf-8',
      'cache-control': isOwner
        ? 'private, no-cache'
        : 'public, max-age=60, stale-while-revalidate=300',
      'x-onsocial-account': accountId,
    });
    res.end(html);
  } catch (_err) {
    res.writeHead(502, { 'content-type': 'text/html' });
    res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Error</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Inter,-apple-system,sans-serif;background:#0f0f11;color:#e4e4e7;display:flex;justify-content:center;align-items:center;min-height:100vh;padding:2rem;text-align:center}h1{font-size:1.5rem;margin-bottom:0.5rem}p{opacity:0.6}a{color:#6366f1}</style>
</head><body><div><h1>Something went wrong</h1><p>${escHtml(accountId)} — try again in a moment.</p><p style="margin-top:1rem"><a href="https://onsocial.id">OnSocial →</a></p></div></body></html>`);
  }
});

server.listen(PORT, () => {
  console.log(`OnSocial Pages server running on :${PORT}`);
  console.log(`Network: ${NEAR_NETWORK} | Contract: ${CORE_CONTRACT}`);
  console.log(`RPC: ${RPC_URL}`);
});
