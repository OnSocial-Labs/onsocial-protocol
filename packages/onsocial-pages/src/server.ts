// ---------------------------------------------------------------------------
// OnSocial Pages — Production HTTP server
//
// Runs behind Caddy which handles TLS for the configured page host pattern.
// Caddy forwards the Host header, so we extract the subdomain from that.
//
//   Host: greenghost.testnet.onsocial.id → accountId = greenghost.testnet
//   Host: greenghost.onsocial.id         → accountId = greenghost.near
//
// Environment:
//   PORT             — listen port (default 3456)
//   DATA_API_URL     — internal gateway base URL for server-side page data
//   PUBLIC_APP_URL   — canonical app base URL for @accountId pages
//   PUBLIC_PAGE_BASE_DOMAIN — base hostname for public pages
//   CORE_CONTRACT    — core contract account ID
//   NEAR_NETWORK     — "testnet" or "mainnet" (default: derived from CORE_CONTRACT)
// ---------------------------------------------------------------------------

import http from 'node:http';
import { resolvePageHost } from './server-utils.js';
import type { PageData } from './types.js';

const PORT = parseInt(process.env.PORT || '3456', 10);
const CORE_CONTRACT = process.env.CORE_CONTRACT || 'core.onsocial.testnet';
const NEAR_NETWORK =
  process.env.NEAR_NETWORK ||
  (CORE_CONTRACT.endsWith('.near') ? 'mainnet' : 'testnet');
const ACCOUNT_SUFFIX = NEAR_NETWORK === 'mainnet' ? '.near' : '.testnet';
const PUBLIC_PAGE_BASE_DOMAIN =
  process.env.PUBLIC_PAGE_BASE_DOMAIN ||
  (NEAR_NETWORK === 'mainnet' ? 'onsocial.id' : 'testnet.onsocial.id');
const DATA_API_URL =
  process.env.DATA_API_URL ||
  (NEAR_NETWORK === 'mainnet' ? 'http://gateway:8080' : 'http://gateway:8080');
const PUBLIC_APP_URL =
  process.env.PUBLIC_APP_URL || `https://${PUBLIC_PAGE_BASE_DOMAIN}`;
const ACCOUNT_VALIDATION_TTL_MS = parseInt(
  process.env.ACCOUNT_VALIDATION_TTL_MS || '300000',
  10
);
const ROOT_REDIRECT_URL = PUBLIC_APP_URL;

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

const accountExistenceCache = new Map<
  string,
  { exists: boolean; expiresAt: number }
>();

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

async function accountExists(accountId: string): Promise<boolean> {
  const cacheKey = `${NEAR_NETWORK}:${accountId}`;
  const now = Date.now();
  const cached = accountExistenceCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.exists;
  }

  const resp = await fetch(
    `${DATA_API_URL}/data/account/exists?accountId=${encodeURIComponent(accountId)}`,
    {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    }
  );

  if (!resp.ok) {
    throw new Error(`Account validation failed: ${resp.status}`);
  }

  const json = (await resp.json()) as { exists?: boolean };
  const exists = json.exists === true;

  accountExistenceCache.set(cacheKey, {
    exists,
    expiresAt: now + ACCOUNT_VALIDATION_TTL_MS,
  });

  return exists;
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderHtmlPage(
  title: string,
  body: string,
  statusCode: number
): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escHtml(title)}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Inter,-apple-system,sans-serif;background:#0f0f11;color:#e4e4e7;display:flex;justify-content:center;align-items:center;min-height:100vh;padding:2rem;text-align:center}h1{font-size:1.5rem;margin-bottom:0.5rem}p{opacity:0.72;max-width:32rem;line-height:1.5}a{color:#6366f1}</style>
</head><body><div><h1>${escHtml(title)}</h1><p>${body}</p><p style="margin-top:1rem"><a href="${ROOT_REDIRECT_URL}">OnSocial →</a></p><p style="display:none">${statusCode}</p></div></body></html>`;
}

function buildCanonicalProfileUrl(accountId: string, search: string): string {
  const baseUrl = PUBLIC_APP_URL.replace(/\/$/, '');
  return `${baseUrl}/@${encodeURIComponent(accountId)}${search}`;
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
  // Caddy sends ?domain=<page-host> — return 200 to allow cert issuance
  if (url.pathname === '/caddy-ask') {
    const domain = url.searchParams.get('domain') ?? '';
    const resolution = resolvePageHost({
      host: domain,
      publicPageBaseDomain: PUBLIC_PAGE_BASE_DOMAIN,
      accountSuffix: ACCOUNT_SUFFIX,
      reservedSubdomains: RESERVED_SUBDOMAINS,
    });

    if (resolution && (await accountExists(resolution.accountId))) {
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
      if (!(await accountExists(accountId))) {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'Account not found' }));
        return;
      }

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
  const resolution = devAccount
    ? null
    : resolvePageHost({
        host,
        publicPageBaseDomain: PUBLIC_PAGE_BASE_DOMAIN,
        accountSuffix: ACCOUNT_SUFFIX,
        reservedSubdomains: RESERVED_SUBDOMAINS,
      });
  const accountId = devAccount || resolution?.accountId;

  if (!accountId) {
    // Root domain or reserved subdomain → redirect
    res.writeHead(302, { Location: ROOT_REDIRECT_URL });
    res.end();
    return;
  }

  try {
    if (!(await accountExists(accountId))) {
      res.writeHead(404, { 'content-type': 'text/html;charset=utf-8' });
      res.end(
        renderHtmlPage(
          'Page not found',
          `${escHtml(accountId)} does not exist on ${escHtml(NEAR_NETWORK)}.`,
          404
        )
      );
      return;
    }

    res.writeHead(308, {
      Location: buildCanonicalProfileUrl(accountId, url.search),
      'cache-control': 'public, max-age=60, stale-while-revalidate=300',
      'x-onsocial-account': accountId,
    });
    res.end();
  } catch (err) {
    console.error('Failed to render page', {
      accountId,
      host,
      path: url.pathname,
      error: err instanceof Error ? err.message : String(err),
    });
    res.writeHead(502, { 'content-type': 'text/html' });
    res.end(
      renderHtmlPage(
        'Something went wrong',
        `${escHtml(accountId)} — try again in a moment.`,
        502
      )
    );
  }
});

server.listen(PORT, () => {
  console.log(`OnSocial Pages server running on :${PORT}`);
  console.log(`Network: ${NEAR_NETWORK} | Contract: ${CORE_CONTRACT}`);
  console.log(`Page domain: ${PUBLIC_PAGE_BASE_DOMAIN}`);
  console.log(`Canonical app: ${PUBLIC_APP_URL}`);
  console.log(`Data API: ${DATA_API_URL}`);
});
