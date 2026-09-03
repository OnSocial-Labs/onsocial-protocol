// ---------------------------------------------------------------------------
// builders/profile — profile slash-key payloads
// ---------------------------------------------------------------------------

import { SCHEMA_VERSION } from '../schema/v1.js';
import type { ProfileData } from '../types.js';
import type { SocialSetData } from './_shared.js';
import { normalizeProfileKindInput } from './profile-kind.js';
import { normalizeProfileIndustryInput } from './profile-industry.js';
import { normalizeProfileLocationInput } from './profile-location.js';
import { profileMetaFromBio } from './profile-meta.js';

const PROFILE_RESERVED_FIELDS = [
  'name',
  'bio',
  'location',
  'industry',
  'kind',
  'avatar',
  'banner',
  'links',
  'tags',
  'photos',
  'hashtags',
  'tickers',
  'mentions',
];

function encodeProfileField(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

export function buildProfileSetData(profile: ProfileData): SocialSetData {
  const data: SocialSetData = {
    'profile/v': String(SCHEMA_VERSION),
  };

  if (profile.name !== undefined) data['profile/name'] = profile.name;
  if (profile.bio !== undefined) data['profile/bio'] = profile.bio;
  if (profile.location !== undefined) {
    if (profile.location === null) {
      data['profile/location'] = null;
    } else {
      const normalized = normalizeProfileLocationInput(
        String(profile.location)
      );
      data['profile/location'] = normalized || null;
    }
  }
  if (profile.industry !== undefined) {
    if (profile.industry === null) {
      data['profile/industry'] = null;
    } else {
      const normalized = normalizeProfileIndustryInput(
        String(profile.industry)
      );
      data['profile/industry'] = normalized || null;
    }
  }
  if (profile.kind !== undefined) {
    data['profile/kind'] =
      profile.kind === null ? null : normalizeProfileKindInput(profile.kind);
  }
  if (profile.avatar !== undefined) data['profile/avatar'] = profile.avatar;
  if (profile.banner !== undefined) data['profile/banner'] = profile.banner;
  if (profile.links !== undefined) {
    data['profile/links'] = encodeProfileField(profile.links);
  }
  if (profile.tags !== undefined) {
    data['profile/tags'] = encodeProfileField(profile.tags);
  }
  if (profile.photos !== undefined) {
    if (profile.photos === null) {
      data['profile/photos'] = null;
    } else {
      const photos = profile.photos
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
        .slice(0, 3);
      data['profile/photos'] = encodeProfileField(photos);
    }
  }

  // When bio is written, derive indexed token arrays (explicit overrides win).
  if (profile.bio !== undefined) {
    const derived = profileMetaFromBio(profile.bio);
    data['profile/hashtags'] = encodeProfileField(
      profile.hashtags !== undefined ? profile.hashtags : derived.hashtags
    );
    data['profile/tickers'] = encodeProfileField(
      profile.tickers !== undefined ? profile.tickers : derived.tickers
    );
    data['profile/mentions'] = encodeProfileField(
      profile.mentions !== undefined ? profile.mentions : derived.mentions
    );
  } else {
    if (profile.hashtags !== undefined) {
      data['profile/hashtags'] = encodeProfileField(profile.hashtags);
    }
    if (profile.tickers !== undefined) {
      data['profile/tickers'] = encodeProfileField(profile.tickers);
    }
    if (profile.mentions !== undefined) {
      data['profile/mentions'] = encodeProfileField(profile.mentions);
    }
  }

  for (const [key, value] of Object.entries(profile)) {
    if (!PROFILE_RESERVED_FIELDS.includes(key) && value !== undefined) {
      data[`profile/${key}`] = encodeProfileField(value);
    }
  }

  return data;
}
