export const APP_HANDOFF_CODE_PARAM = 'onsocial_code';
export const APP_HANDOFF_APP_PARAM = 'onsocial_app';

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
  const appId = (params.get(APP_HANDOFF_APP_PARAM) ?? '').trim().toLowerCase();
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
