import { cache } from 'react';
import {
  profileIndustryFromMaterialised,
  profileKindFromMaterialised,
  profileLeadFromMaterialised,
  profileAboutAlignFromMaterialised,
  profileLocationFromMaterialised,
  type MaterialisedProfile,
  type ProfileAboutAlign,
  type ProfileKind,
  type ResolvedProfileMedia,
} from '@onsocial/sdk';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';
import { profileIdentityTopics } from '@/lib/profile-identity-topics';
import {
  profileAboutPhotosFromStored,
  type ProfileAboutPhoto,
} from '@/lib/profile-about-photos';
import { resolveStoredProfileFaceAbout } from '@/lib/profile-bio-face';

/** Indexed profile shell for SSR — mirrors Portal's `loadPortalProfileShell`. */
export interface AppProfileShell {
  accountId: string;
  name: string | null;
  /** Coarse “based in” label (city / region). Not GPS. */
  location: string | null;
  /** User-curated org line. */
  industry: string | null;
  /** Optional face kind. Omit / person is an individual. */
  kind: ProfileKind | null;
  /** Page / face bio (`profile/bio`), soft-migrated from legacy joins. */
  bio: string | null;
  /** About continuation (`profile/about`). */
  about: string | null;
  /** Quiet About lead above the print (`profile/lead`). */
  lead: string | null;
  /** More for About essay alignment (`profile/aboutAlign`). */
  aboutAlign: ProfileAboutAlign;
  avatarUrl: string | null;
  bannerUrl: string | null;
  avatarMedia: ResolvedProfileMedia | null;
  bannerMedia: ResolvedProfileMedia | null;
  links: MaterialisedProfile['links'];
  /** Curated identity topics (`profile/tags`). Independent of bio `#`. */
  tags: string[];
  /** About gallery (`profile/photos`) — resolved URLs, max 3. */
  photos: ProfileAboutPhoto[];
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
      const industry = profileIndustryFromMaterialised(profile);
      const kind = profileKindFromMaterialised(profile) ?? null;
      const lead = profileLeadFromMaterialised(profile);
      const aboutAlign = profileAboutAlignFromMaterialised(profile);
      const { face, about } = resolveStoredProfileFaceAbout(
        profile.bio,
        profile.about
      );
      return {
        accountId,
        name: profile.name ?? null,
        location: location || null,
        industry: industry || null,
        kind,
        bio: face.trim() || null,
        about: about.trim() || null,
        lead: lead || null,
        aboutAlign,
        avatarUrl: os.profiles.avatarUrl(profile),
        bannerUrl: os.profiles.bannerUrl(profile),
        avatarMedia: os.profiles.avatarMedia(profile),
        bannerMedia: os.profiles.bannerMedia(profile),
        links: profile.links,
        tags: profileIdentityTopics(profile.tags),
        photos: profileAboutPhotosFromStored(
          profile.photos,
          profile.extra.photos
        ),
        hashtags: profile.hashtags ?? [],
        tickers: profile.tickers ?? [],
        mentions: profile.mentions ?? [],
      };
    } catch {
      return null;
    }
  }
);
