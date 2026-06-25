import { cache } from 'react';
import type { MaterialisedProfile, ResolvedProfileMedia } from '@onsocial/sdk';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';

/** Indexed profile shell for SSR — mirrors Portal's `loadPortalProfileShell`. */
export interface AppProfileShell {
  accountId: string;
  name: string | null;
  bio: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  avatarMedia: ResolvedProfileMedia | null;
  bannerMedia: ResolvedProfileMedia | null;
  links: MaterialisedProfile['links'];
  tags: string[];
}

export const loadProfileShell = cache(
  async (accountId: string): Promise<AppProfileShell | null> => {
    try {
      const os = createServerOnSocialClient();
      const profile = await os.profiles.get(accountId);
      if (!profile) {
        return null;
      }

      return {
        accountId,
        name: profile.name ?? null,
        bio: profile.bio ?? null,
        avatarUrl: os.profiles.avatarUrl(profile),
        bannerUrl: os.profiles.bannerUrl(profile),
        avatarMedia: os.profiles.avatarMedia(profile),
        bannerMedia: os.profiles.bannerMedia(profile),
        links: profile.links,
        tags: profile.tags ?? [],
      };
    } catch {
      return null;
    }
  }
);
