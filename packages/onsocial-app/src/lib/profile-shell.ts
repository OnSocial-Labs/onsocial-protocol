import { cache } from 'react';
import type { MaterialisedProfile, ResolvedProfileMedia } from '@onsocial/sdk';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';
import { profileLocationFromMaterialised } from '@/lib/profile-location';

/** Indexed profile shell for SSR — mirrors Portal's `loadPortalProfileShell`. */
export interface AppProfileShell {
  accountId: string;
  name: string | null;
  /** Coarse “based in” label (city / region). Not GPS. */
  location: string | null;
  bio: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  avatarMedia: ResolvedProfileMedia | null;
  bannerMedia: ResolvedProfileMedia | null;
  links: MaterialisedProfile['links'];
  /** Freeform tags kept for schema interop; app UI does not surface them. */
  tags: string[];
  hashtags: string[];
  tickers: string[];
  mentions: string[];
}

export const loadProfileShell = cache(
  async (accountId: string): Promise<AppProfileShell | null> => {
    try {
      const os = createServerOnSocialClient();
      const profile = await os.profiles.get(accountId);
      if (!profile) {
        return null;
      }

      const location = profileLocationFromMaterialised(profile);
      return {
        accountId,
        name: profile.name ?? null,
        location: location || null,
        bio: profile.bio ?? null,
        avatarUrl: os.profiles.avatarUrl(profile),
        bannerUrl: os.profiles.bannerUrl(profile),
        avatarMedia: os.profiles.avatarMedia(profile),
        bannerMedia: os.profiles.bannerMedia(profile),
        links: profile.links,
        tags: profile.tags ?? [],
        hashtags: profile.hashtags ?? [],
        tickers: profile.tickers ?? [],
        mentions: profile.mentions ?? [],
      };
    } catch {
      return null;
    }
  }
);
