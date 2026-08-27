export const APP_HANDOFF_CODE_PARAM = 'onsocial_code';
export const APP_HANDOFF_APP_PARAM = 'onsocial_app';
/** Listed community app ids: 2–64 lowercase letters, numbers, hyphen, underscore. */
export const APP_ID_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/;

export function normalizeAppId(raw: string): string | null {
  const appId = raw.trim().toLowerCase();
  return APP_ID_RE.test(appId) ? appId : null;
}

export type AppHandoffParams = {
  code: string;
  appId: string;
};

function searchParamsFrom(
  source: string | URL | { search?: string }
): URLSearchParams {
  if (typeof source === 'string') {
    try {
      return source.includes('://')
        ? new URL(source).searchParams
        : new URLSearchParams(
            source.startsWith('?') ? source.slice(1) : source
          );
    } catch {
      return new URLSearchParams();
    }
  }
  if (source instanceof URL) return source.searchParams;
  return new URLSearchParams(source.search ?? '');
}

/** Read `onsocial_code` + `onsocial_app` from a URL, search string, or location. */
export function parseAppHandoffFromUrl(
  source: string | URL | { search?: string } = typeof window === 'undefined'
    ? ''
    : window.location.href
): AppHandoffParams | null {
  const params = searchParamsFrom(source);
  const code = params.get(APP_HANDOFF_CODE_PARAM)?.trim() ?? '';
  const appId = normalizeAppId(params.get(APP_HANDOFF_APP_PARAM) ?? '');
  if (!code || !appId) return null;
  return { code, appId };
}

/** Append one-time handoff params to a listed https href. */
export function buildAppHandoffUrl(
  href: string,
  handoff: AppHandoffParams
): string {
  const url = new URL(href);
  url.searchParams.set(APP_HANDOFF_CODE_PARAM, handoff.code);
  url.searchParams.set(APP_HANDOFF_APP_PARAM, handoff.appId);
  return url.toString();
}

export const OS_HANDOFF_PATH = '/handoff';
export const OS_HANDOFF_APP_PARAM = 'app';

/** OS page that signs the viewer in and returns them to the listed site. */
export function buildOsAppHandoffUrl(osOrigin: string, appId: string): string {
  const origin = osOrigin.trim().replace(/\/$/, '');
  const id = normalizeAppId(appId);
  if (!origin || !id) {
    throw new Error('osOrigin and a valid appId are required');
  }
  const url = new URL(OS_HANDOFF_PATH, `${origin}/`);
  url.searchParams.set(OS_HANDOFF_APP_PARAM, id);
  return url.toString();
}

/** Drop handoff query params after the code is exchanged. */
export function stripAppHandoffFromUrl(source: string): string {
  const base = source.includes('://')
    ? source
    : `https://placeholder.invalid${source.startsWith('/') ? '' : '/'}${source}`;
  const url = new URL(base);
  url.searchParams.delete(APP_HANDOFF_CODE_PARAM);
  url.searchParams.delete(APP_HANDOFF_APP_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}
