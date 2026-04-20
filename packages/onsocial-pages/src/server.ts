// ---------------------------------------------------------------------------
// OnSocial Pages — Production HTTP server
//
// Runs behind Caddy which handles TLS for *.onsocial.id.
// Caddy forwards the Host header, so we extract the subdomain from that.
//
//   Host: greenghost.onsocial.id → accountId = greenghost.testnet (or .near)
//
// Environment:
//   PORT             — listen port (default 3456)
//   DATA_API_URL     — internal gateway base URL for server-side page data
//   PUBLIC_API_URL   — public gateway URL used by browser-side actions/editing
//   CORE_CONTRACT    — core contract account ID
//   NEAR_NETWORK     — "testnet" or "mainnet" (default: derived from CORE_CONTRACT)
// ---------------------------------------------------------------------------

import http from 'node:http';
import { renderPage } from './renderer.js';
import type { PageData } from './types.js';

const PORT = parseInt(process.env.PORT || '3456', 10);
const CORE_CONTRACT = process.env.CORE_CONTRACT || 'core.onsocial.testnet';
const NEAR_NETWORK =
  process.env.NEAR_NETWORK ||
  (CORE_CONTRACT.endsWith('.near') ? 'mainnet' : 'testnet');
const ACCOUNT_SUFFIX = NEAR_NETWORK === 'mainnet' ? '.near' : '.testnet';
const DATA_API_URL =
  process.env.DATA_API_URL ||
  (NEAR_NETWORK === 'mainnet'
    ? 'http://gateway:8080'
    : 'http://gateway:8080');
const PUBLIC_API_URL =
  process.env.PUBLIC_API_URL ||
  (NEAR_NETWORK === 'mainnet'
    ? 'https://api.onsocial.id'
    : 'https://testnet.onsocial.id');

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

async function fetchPageData(accountId: string): Promise<PageData> {
  const resp = await fetch(
    `${DATA_API_URL}/data/page?accountId=${encodeURIComponent(accountId)}`,
    {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    }
  );

  if (!resp.ok) {
    const details = await resp.text().catch(() => '');
    throw new Error(`Data API error: ${resp.status} ${details}`.trim());
  }

  return (await resp.json()) as PageData;
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
      apiUrl: PUBLIC_API_URL,
    });

    res.writeHead(200, {
      'content-type': 'text/html;charset=utf-8',
      'cache-control': isOwner
        ? 'private, no-cache'
        : 'public, max-age=60, stale-while-revalidate=300',
      'x-onsocial-account': accountId,
    });
    res.end(html);
  } catch (err) {
    console.error('Failed to render page', {
      accountId,
      host,
      path: url.pathname,
      error: err instanceof Error ? err.message : String(err),
    });
    res.writeHead(502, { 'content-type': 'text/html' });
    res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Error</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Inter,-apple-system,sans-serif;background:#0f0f11;color:#e4e4e7;display:flex;justify-content:center;align-items:center;min-height:100vh;padding:2rem;text-align:center}h1{font-size:1.5rem;margin-bottom:0.5rem}p{opacity:0.6}a{color:#6366f1}</style>
</head><body><div><h1>Something went wrong</h1><p>${escHtml(accountId)} — try again in a moment.</p><p style="margin-top:1rem"><a href="https://onsocial.id">OnSocial →</a></p></div></body></html>`);
  }
});

server.listen(PORT, () => {
  console.log(`OnSocial Pages server running on :${PORT}`);
  console.log(`Network: ${NEAR_NETWORK} | Contract: ${CORE_CONTRACT}`);
  console.log(`Data API: ${DATA_API_URL}`);
  console.log(`Public API: ${PUBLIC_API_URL}`);
});
