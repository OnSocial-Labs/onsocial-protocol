// ---------------------------------------------------------------------------
// Dev server — standalone Node.js HTTP server for local page previewing.
//
// Reads directly from NEAR testnet RPC (no gateway dependency).
//
//   pnpm --filter @onsocial/pages dev:local
//   → http://localhost:8787?account=greenghost.testnet
//
// Supports:
//   ?account=alice.testnet     — render page for account
//   ?account=...&template=creator  — force a template
// ---------------------------------------------------------------------------

import http from 'node:http';
import { renderPage } from './renderer.js';
import { buildPageUrl } from './server-utils.js';
import type { PageData, PageProfile, PageConfig } from './types.js';

const PORT = parseInt(process.env.PORT || '8787', 10);
const RPC_URL = process.env.NEAR_RPC_URL || 'https://rpc.testnet.near.org';
const CORE_CONTRACT = process.env.CORE_CONTRACT || 'core.onsocial.testnet';
const PUBLIC_PAGE_BASE_DOMAIN =
  process.env.PUBLIC_PAGE_BASE_DOMAIN ||
  (CORE_CONTRACT.endsWith('.near') ? 'onsocial.id' : 'testnet.onsocial.id');

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

  const body = JSON.stringify({
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
  });

  const resp = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
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

  // Build lookup
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
    if (parsed && typeof parsed === 'object') {
      pageConfig = parsed as PageConfig;
    }
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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  // Health
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  // JSON API — same shape as gateway /data/page
  if (url.pathname === '/data/page') {
    const accountId = url.searchParams.get('accountId');
    if (!accountId) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing accountId' }));
      return;
    }
    try {
      const data = await fetchPageData(accountId);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(data, null, 2));
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

  // Rendered page
  const accountId = url.searchParams.get('account');
  if (!accountId) {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>OnSocial Pages Dev</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Inter,-apple-system,sans-serif;background:#0f0f11;color:#e4e4e7;display:flex;justify-content:center;align-items:center;min-height:100vh;padding:2rem;text-align:center}h1{font-size:2rem;margin-bottom:1rem}p{opacity:0.7;margin-bottom:0.5rem}a{color:#6366f1}code{background:rgba(255,255,255,0.1);padding:0.15em 0.4em;border-radius:4px;font-size:0.9em}.examples{margin-top:1.5rem;text-align:left;display:inline-block}.examples a{display:block;margin:0.4rem 0}</style>
</head><body><div>
  <h1>OnSocial Pages</h1>
  <p>Local dev server — pass <code>?account=name.testnet</code> to render a page.</p>
  <div class="examples">
    <a href="?account=greenghost.testnet">greenghost.testnet</a>
    <a href="?account=greenghost.testnet&template=creator">greenghost.testnet (creator template)</a>
    <a href="?account=greenghost.testnet&edit=true">greenghost.testnet (edit mode ✏️)</a>
    <a href="?account=greenghost.testnet&template=creator&edit=true">creator + edit mode</a>
    <a href="/data/page?accountId=greenghost.testnet">Raw JSON data</a>
  </div>
</div></body></html>`);
    return;
  }

  try {
    const data = await fetchPageData(accountId);

    // Allow template override via query param
    const templateOverride = url.searchParams.get('template');
    if (templateOverride) {
      data.config.template = templateOverride;
    }

    // If no profile data, show a nice preview with the account name
    if (!data.profile.name) {
      data.profile.name = accountId.replace(/\.testnet$|\.near$/, '');
    }

    // ?edit=true simulates being the page owner
    const isOwner = url.searchParams.get('edit') === 'true';

    const requestUrl = buildPageUrl(accountId, PUBLIC_PAGE_BASE_DOMAIN);
    const html = renderPage(data, requestUrl, {
      isOwner,
      apiUrl: `http://localhost:${PORT}`,
    });

    res.writeHead(200, {
      'content-type': 'text/html;charset=utf-8',
      'x-onsocial-account': accountId,
    });
    res.end(html);
  } catch (err) {
    res.writeHead(502, { 'content-type': 'text/html' });
    res.end(
      `<pre>Error fetching page for ${accountId}:\n${err instanceof Error ? err.message : String(err)}</pre>`
    );
  }
});

server.listen(PORT, () => {
  console.log(`\n  OnSocial Pages dev server running at:\n`);
  console.log(`    http://localhost:${PORT}?account=greenghost.testnet`);
  console.log(
    `    http://localhost:${PORT}?account=greenghost.testnet&template=creator`
  );
  console.log(
    `    http://localhost:${PORT}/data/page?accountId=greenghost.testnet`
  );
  console.log(
    `\n  Reading from: ${CORE_CONTRACT} via ${RPC_URL} | Pages: ${PUBLIC_PAGE_BASE_DOMAIN}\n`
  );
});
