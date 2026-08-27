const APP_ID_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/;

export function parseCommunityOsHandoffAppId(
  raw: string | string[] | null | undefined
): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const appId = value?.trim().toLowerCase() ?? '';
  return APP_ID_RE.test(appId) ? appId : null;
}
