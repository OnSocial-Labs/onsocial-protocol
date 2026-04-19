// ---------------------------------------------------------------------------
// OnSocial Pages — Cloudflare Workers edge function
//
// Routes:
//   GET *.onsocial.id  → rendered profile page
//   GET /health        → health check
//
// The worker extracts the account name from the subdomain, fetches
// aggregated page data from the gateway API, and returns server-rendered
// HTML with OG tags for social previews.
// ---------------------------------------------------------------------------

import { renderPage } from './renderer.js';
import type { Env, PageData } from './types.js';

/** Extract accountId from the auth session cookie via gateway. */
async function resolveSession(
  cookie: string | null,
  gatewayUrl: string
): Promise<string | null> {
  if (!cookie) return null;
  try {
    const resp = await fetch(`${gatewayUrl}/auth/session`, {
      headers: { Cookie: cookie, Accept: 'application/json' },
      signal: AbortSignal.timeout(3_000),
    });
    if (!resp.ok) return null;
    const session = (await resp.json()) as { accountId?: string };
    return session.accountId ?? null;
  } catch {
    return null;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const hostname = url.hostname;

    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    // Extract subdomain — e.g. "alice" from "alice.onsocial.id"
    const parts = hostname.split('.');
    // Expect at least 3 parts: subdomain.onsocial.id
    // In dev, could be subdomain.localhost so also handle 2-part
    const subdomain =
      parts.length >= 3 ? parts[0] : parts.length === 2 ? parts[0] : null;

    // Dev mode: accept ?account= query param (for localhost testing)
    const devAccount = url.searchParams.get('account');

    if (
      !subdomain ||
      subdomain === 'www' ||
      subdomain === 'app' ||
      subdomain === 'api' ||
      subdomain === 'localhost' ||
      subdomain === '127'
    ) {
      if (!devAccount) {
        // Redirect root / reserved subdomains to main site
        return Response.redirect('https://onsocial.id', 302);
      }
    }

    // Resolve account ID — subdomain maps to account, or use ?account= in dev
    const accountId = devAccount || subdomain!;

    try {
      const gatewayUrl = env.GATEWAY_URL || 'https://api.onsocial.id';
      const dataUrl = `${gatewayUrl}/data/page?accountId=${encodeURIComponent(accountId)}`;

      const resp = await fetch(dataUrl, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5_000),
      });

      if (!resp.ok) {
        return notFoundPage(accountId);
      }

      const data = (await resp.json()) as PageData;

      // Check if viewer is the page owner (shared cookie on *.onsocial.id)
      const cookie = request.headers.get('Cookie');
      const sessionAccountId = await resolveSession(cookie, gatewayUrl);
      const isOwner = sessionAccountId === accountId;

      const html = renderPage(data, request.url, {
        isOwner,
        apiUrl: gatewayUrl,
      });

      return new Response(html, {
        headers: {
          'content-type': 'text/html;charset=utf-8',
          // Owner gets no-cache so edits are live; visitors get CDN cache
          'cache-control': isOwner
            ? 'private, no-cache'
            : 'public, s-maxage=60, stale-while-revalidate=300',
          'x-onsocial-account': accountId,
        },
      });
    } catch {
      return errorPage(accountId);
    }
  },
};

function notFoundPage(accountId: string): Response {
  return new Response(
    `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Not Found — OnSocial</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Inter,-apple-system,sans-serif;background:#0f0f11;color:#e4e4e7;display:flex;justify-content:center;align-items:center;min-height:100vh;padding:2rem;text-align:center}h1{font-size:1.5rem;margin-bottom:0.5rem}p{opacity:0.6}a{color:#6366f1}</style>
</head>
<body>
<div>
  <h1>Page not found</h1>
  <p><strong>${escHtml(accountId)}</strong> hasn't set up their OnSocial page yet.</p>
  <p style="margin-top:1rem"><a href="https://app.onsocial.id">Create yours →</a></p>
</div>
</body></html>`,
    {
      status: 404,
      headers: { 'content-type': 'text/html;charset=utf-8' },
    }
  );
}

function errorPage(accountId: string): Response {
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
  <p style="margin-top:1rem"><a href="https://onsocial.id">Go to OnSocial →</a></p>
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
