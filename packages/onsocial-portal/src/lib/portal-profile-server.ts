import type { MaterialisedProfile } from '@onsocial/sdk';
import { createPortalServerOnSocialClient } from '@/lib/onsocial-server-client';

/** Public profile shell for SSR first paint (no viewer-specific graph). */
export interface PortalProfileShell {
  accountId: string;
  profile: MaterialisedProfile | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
}

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

export function isValidPortalAccountId(accountId: string): boolean {
  return ACCOUNT_ID_PATTERN.test(accountId);
}

export async function loadPortalProfileShell(
  accountId: string
): Promise<PortalProfileShell | null> {
  if (!isValidPortalAccountId(accountId)) return null;

  try {
    const os = createPortalServerOnSocialClient();
    const profile = await os.profiles.get(accountId);
    return {
      accountId,
      profile,
      avatarUrl: os.profiles.avatarUrl(profile),
      bannerUrl: os.profiles.bannerUrl(profile),
    };
  } catch {
    return null;
  }
}
