import type { PageConfig } from '@onsocial/sdk';
import { ACTIVE_API_URL } from '@/lib/app-config';
import { BROWSER_GATEWAY_PROXY } from '@/lib/app-gateway-url';
import { getServerApiKey } from '@/lib/create-server-onsocial-client';
import type { PublicPageConfig } from '@/lib/page-data';

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, '');
}

function parsePageConfigValue(value: unknown): PublicPageConfig {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as PublicPageConfig;
      }
    } catch {
      return {};
    }
    return {};
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as PublicPageConfig;
  }

  return {};
}

/** On-chain `page/main` — bypasses the indexer so saves show up immediately. */
export async function fetchPageConfigFromChain(
  accountId: string,
  opts: { gatewayUrl?: string; apiKey?: string } = {}
): Promise<PublicPageConfig> {
  const base = stripTrailingSlash(opts.gatewayUrl ?? ACTIVE_API_URL);
  const params = new URLSearchParams({ key: 'page/main', accountId });
  const headers: Record<string, string> = { Accept: 'application/json' };
  const apiKey = opts.apiKey ?? getServerApiKey();
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  const response = await fetch(`${base}/data/get-one?${params}`, {
    headers,
    cache: 'no-store',
  });

  if (!response.ok) {
    return {};
  }

  const entry = (await response.json()) as { value?: unknown };
  return parsePageConfigValue(entry?.value);
}

/** Browser same-origin proxy to on-chain `page/main`. */
export async function fetchPageConfigFromBrowserProxy(
  accountId: string
): Promise<PageConfig> {
  const params = new URLSearchParams({ key: 'page/main', accountId });
  const response = await fetch(`${BROWSER_GATEWAY_PROXY}/data/get-one?${params}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  if (!response.ok) {
    return {};
  }

  const entry = (await response.json()) as { value?: unknown };
  return parsePageConfigValue(entry?.value) as PageConfig;
}
