import { BROWSER_GATEWAY_PROXY } from '@/lib/app-gateway-url';

function buildAppHandoffUrl(
  href: string,
  handoff: { code: string; appId: string }
): string {
  const url = new URL(href);
  url.searchParams.set('onsocial_code', handoff.code);
  url.searchParams.set('onsocial_app', handoff.appId);
  return url.toString();
}

export function communityAppIdFromLauncherId(id: string): string | null {
  if (!id.startsWith('community:')) return null;
  const appId = id.slice('community:'.length).trim().toLowerCase();
  return appId || null;
}

export function resolveCommunityLaunchHref(input: {
  href: string;
  appId: string;
  handoff: { code: string; href: string } | null;
}): string {
  if (!input.handoff?.code) return input.href;
  try {
    return buildAppHandoffUrl(input.handoff.href || input.href, {
      code: input.handoff.code,
      appId: input.appId,
    });
  } catch {
    return input.href;
  }
}

export async function requestCommunityAppHandoff(
  appId: string,
  token: string
): Promise<{ code: string; href: string } | null> {
  const response = await fetch(`${BROWSER_GATEWAY_PROXY}/auth/app-handoff`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ appId }),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { code?: string; href?: string };
  if (typeof body.code !== 'string' || typeof body.href !== 'string') {
    return null;
  }
  if (!body.href.startsWith('https://')) return null;
  return { code: body.code, href: body.href };
}

/** Open the tab on the user gesture so a later await cannot be popup-blocked. */
export function openCommunityAppWindow(): Window | null {
  if (typeof window === 'undefined') return null;
  const popup = window.open('about:blank', '_blank');
  if (popup) {
    try {
      popup.opener = null;
    } catch {
      // ignore
    }
  }
  return popup;
}

export function assignCommunityAppWindow(
  popup: Window | null,
  href: string
): void {
  if (popup && !popup.closed) {
    popup.location.replace(href);
    return;
  }
  if (typeof window !== 'undefined') {
    window.open(href, '_blank', 'noopener,noreferrer');
  }
}

export async function launchCommunityApp(input: {
  appId: string;
  href: string;
  token: string | null;
  popup: Window | null;
}): Promise<string> {
  let handoff: { code: string; href: string } | null = null;
  if (input.token) {
    try {
      handoff = await requestCommunityAppHandoff(input.appId, input.token);
    } catch {
      handoff = null;
    }
  }
  const href = resolveCommunityLaunchHref({
    href: input.href,
    appId: input.appId,
    handoff,
  });
  assignCommunityAppWindow(input.popup, href);
  return href;
}
