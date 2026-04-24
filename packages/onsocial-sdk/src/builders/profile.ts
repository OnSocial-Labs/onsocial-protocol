// ---------------------------------------------------------------------------
// builders/profile — profile slash-key payloads
// ---------------------------------------------------------------------------

import { SCHEMA_VERSION } from '../schema/v1.js';
import type { ProfileData } from '../types.js';
import type { SocialSetData } from './_shared.js';

const PROFILE_RESERVED_FIELDS = [
  'name',
  'bio',
  'avatar',
  'banner',
  'links',
  'tags',
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
  if (profile.avatar !== undefined) data['profile/avatar'] = profile.avatar;
  if (profile.banner !== undefined) data['profile/banner'] = profile.banner;
  if (profile.links !== undefined) {
    data['profile/links'] = encodeProfileField(profile.links);
  }
  if (profile.tags !== undefined) {
    data['profile/tags'] = encodeProfileField(profile.tags);
  }

  for (const [key, value] of Object.entries(profile)) {
    if (!PROFILE_RESERVED_FIELDS.includes(key) && value !== undefined) {
      data[`profile/${key}`] = encodeProfileField(value);
    }
  }

  return data;
}
