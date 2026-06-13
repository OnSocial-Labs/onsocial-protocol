import type { MaterialisedProfile } from '@onsocial/sdk';
import { createPortalServerOnSocialClient } from '@/lib/onsocial-server-client';
import { profileSearchRowToMaterialised } from '@/lib/profile-social-server';
import { withRateLimitRetry } from '@/lib/portal-request-cache';

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

export async function loadPortalProfileShells(
  accountIds: string[]
): Promise<Map<string, PortalProfileShell>> {
  const uniqueIds = [
    ...new Set(
      accountIds
        .map((id) => id.trim().toLowerCase())
        .filter((id) => isValidPortalAccountId(id))
    ),
  ];
  if (uniqueIds.length === 0) return new Map();

  try {
    return await withRateLimitRetry(async () => {
      const os = createPortalServerOnSocialClient();
      const enrichment = await os.standings.enrichPeers(null, uniqueIds);
      const shells = new Map<string, PortalProfileShell>();

      for (const row of enrichment.profiles) {
        const accountId = row.accountId.trim().toLowerCase();
        const profile = profileSearchRowToMaterialised(row);
        shells.set(accountId, {
          accountId: row.accountId,
          profile,
          avatarUrl: os.profiles.avatarUrl(profile),
          bannerUrl: os.profiles.bannerUrl(profile),
        });
      }

      return shells;
    });
  } catch {
    return new Map();
  }
}
