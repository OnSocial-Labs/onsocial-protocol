// ---------------------------------------------------------------------------
// OnSocial Pages — Cloudflare Workers edge function
//
// Routes:
//   GET *.{PUBLIC_PAGE_BASE_DOMAIN}  → validated redirect to canonical profile page
//   GET /health        → health check
//
// The worker extracts the account name from the subdomain, validates it via
// the gateway API, and redirects to the canonical @accountId route.
// ---------------------------------------------------------------------------

import { resolvePageHost } from './server-utils.js';
import type { Env } from './types.js';

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
  'localhost',
  '127',
]);

function buildCanonicalProfileUrl(
  publicAppUrl: string,
  accountId: string,
  search: string
): string {
  const baseUrl = publicAppUrl.replace(/\/$/, '');
  return `${baseUrl}/@${encodeURIComponent(accountId)}${search}`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const hostname = url.hostname;
    const nearNetwork = env.NEAR_NETWORK ?? 'testnet';
    const publicPageBaseDomain =
      env.PUBLIC_PAGE_BASE_DOMAIN ??
      (nearNetwork === 'mainnet' ? 'onsocial.id' : 'testnet.onsocial.id');
    const accountSuffix = nearNetwork === 'mainnet' ? '.near' : '.testnet';
    const siteUrl = `https://${publicPageBaseDomain}`;
    const publicAppUrl = env.PUBLIC_APP_URL || siteUrl;
    const gatewayUrl =
      env.PUBLIC_API_URL ||
      env.GATEWAY_URL ||
      (nearNetwork === 'mainnet'
        ? 'https://api.onsocial.id'
        : 'https://testnet.onsocial.id');

    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    // Dev mode: accept ?account= query param (for localhost testing)
    const devAccount = url.searchParams.get('account');
    const resolution = devAccount
      ? null
      : resolvePageHost({
          host: hostname,
          publicPageBaseDomain,
          accountSuffix,
          reservedSubdomains: RESERVED_SUBDOMAINS,
        });

    if (!resolution && !devAccount) {
      return Response.redirect(siteUrl, 302);
    }

    const accountId = devAccount || resolution!.accountId;

    try {
      const existsUrl = `${gatewayUrl}/data/account/exists?accountId=${encodeURIComponent(accountId)}`;

      const resp = await fetch(existsUrl, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5_000),
      });

      if (!resp.ok) {
        return notFoundPage(accountId, publicAppUrl);
      }

      const payload = (await resp.json()) as { exists?: boolean };
      if (!payload.exists) {
        return notFoundPage(accountId, publicAppUrl);
      }

      return Response.redirect(
        buildCanonicalProfileUrl(publicAppUrl, accountId, url.search),
        308
      );
    } catch {
      return errorPage(accountId, publicAppUrl);
    }
  },
};

function notFoundPage(accountId: string, siteUrl: string): Response {
  return new Response(
    `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Not Found — OnSocial</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Inter,-apple-system,sans-serif;background:#0f0f11;color:#e4e4e7;display:flex;justify-content:center;align-items:center;min-height:100vh;padding:2rem;text-align:center}h1{font-size:1.5rem;margin-bottom:0.5rem}p{opacity:0.6}a{color:#6366f1}</style>
</head>
<body>
<div>
  <h1>Page not found</h1>
  <p><strong>${escHtml(accountId)}</strong> does not exist on this network.</p>
  <p style="margin-top:1rem"><a href="${siteUrl}">OnSocial →</a></p>
</div>
</body></html>`,
    {
      status: 404,
      headers: { 'content-type': 'text/html;charset=utf-8' },
    }
  );
}

function errorPage(accountId: string, siteUrl: string): Response {
  return new Response(
    `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Error — OnSocial</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Inter,-apple-system,sans-serif;background:#0f0f11;color:#e4e4e7;display:flex;justify-content:center;align-items:center;min-height:100vh;padding:2rem;text-align:center}h1{font-size:1.5rem;margin-bottom:0.5rem}p{opacity:0.6}a{color:#6366f1}</style>
</head>
<body>
<div>
  <h1>Something went wrong</h1>
  <p>We couldn't load the page for <strong>${escHtml(accountId)}</strong>. Try again in a moment.</p>
  <p style="margin-top:1rem"><a href="${siteUrl}">Go to OnSocial →</a></p>
</div>
</body></html>`,
    {
      status: 502,
      headers: { 'content-type': 'text/html;charset=utf-8' },
    }
  );
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
