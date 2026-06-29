import type { Session } from '@onsocial/sdk/advanced';

interface CachedAppSocialSession {
  accountId: string;
  session: Session;
}

let cachedAppSocialSession: CachedAppSocialSession | null = null;

export function getCachedAppSocialSession(
  accountId: string
): Session | null {
  if (
    cachedAppSocialSession &&
    cachedAppSocialSession.accountId === accountId
  ) {
    return cachedAppSocialSession.session;
  }
  return null;
}

export function setCachedAppSocialSession(
  accountId: string,
  session: Session
): void {
  cachedAppSocialSession = { accountId, session };
}

/** Clear cached session after wallet disconnect or session bootstrap. */
export function invalidateAppSocialSessionCache(): void {
  cachedAppSocialSession = null;
}
