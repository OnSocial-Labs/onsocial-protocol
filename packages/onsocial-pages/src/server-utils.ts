export interface PageHostResolution {
  accountId: string;
  hostname: string;
  subdomain: string;
}

interface ResolvePageHostOptions {
  host: string;
  publicPageBaseDomain: string;
  accountSuffix: string;
  reservedSubdomains: Set<string>;
}

export function normalizeHost(host: string): string {
  return host.split(':')[0]?.trim().toLowerCase() ?? '';
}

export function resolvePageHost({
  host,
  publicPageBaseDomain,
  accountSuffix,
  reservedSubdomains,
}: ResolvePageHostOptions): PageHostResolution | null {
  const hostname = normalizeHost(host);
  const baseDomain = publicPageBaseDomain.trim().toLowerCase();

  if (!hostname || !baseDomain || hostname === baseDomain) {
    return null;
  }

  const suffix = `.${baseDomain}`;
  if (!hostname.endsWith(suffix)) {
    return null;
  }

  const subdomain = hostname.slice(0, -suffix.length);
  if (
    !subdomain ||
    subdomain.includes('.') ||
    reservedSubdomains.has(subdomain)
  ) {
    return null;
  }

  return {
    accountId: `${subdomain}${accountSuffix}`,
    hostname,
    subdomain,
  };
}

export function buildPageUrl(
  accountId: string,
  publicPageBaseDomain: string
): string {
  const subdomain = accountId.replace(/\.testnet$|\.near$/, '');
  return `https://${subdomain}.${publicPageBaseDomain}`;
}
