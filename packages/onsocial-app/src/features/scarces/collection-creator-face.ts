import type { OnSocial } from '@onsocial/sdk';
import { fallbackLabel, resolveProfileMediaUrl } from '@/lib/profile-display';

/** Creator chrome for drop / player — indexer profile + stats. */
export type CollectionCreatorFace = {
  avatarUrl: string | null;
  displayName: string | null;
};

/** Shared display-name / avatar rules for drop + player creator chrome. */
export function resolveCollectionCreatorFace(
  creatorId: string,
  opts: {
    profileName?: string | null;
    profileAvatarUrl?: string | null;
    statsName?: string | null;
    statsAvatar?: string | null;
  }
): CollectionCreatorFace {
  const id = creatorId.trim();
  const avatarUrl =
    opts.profileAvatarUrl?.trim() ||
    (opts.statsAvatar ? resolveProfileMediaUrl(opts.statsAvatar) : null) ||
    null;
  const handle = fallbackLabel(id);
  const rawName = opts.profileName?.trim() || opts.statsName?.trim() || null;
  const hasDisplayName =
    Boolean(rawName) &&
    rawName!.toLowerCase() !== handle.toLowerCase() &&
    rawName!.toLowerCase() !== id.toLowerCase();
  return {
    avatarUrl,
    displayName: hasDisplayName ? rawName : null,
  };
}

/** Fetch creator face via any OnSocial client (server key or browser). */
export async function fetchCollectionCreatorFace(
  client: OnSocial,
  creatorId: string
): Promise<CollectionCreatorFace> {
  const id = creatorId.trim();
  if (!id) return { avatarUrl: null, displayName: null };
  try {
    const [profile, statsRows] = await Promise.all([
      client.profiles.get(id),
      client.query.profiles.statsForAccounts([id]),
    ]);
    const media = profile ? client.profiles.avatarMedia(profile) : null;
    const faceFromProfile =
      media?.kind === 'image'
        ? media.url
        : (media?.poster ?? client.profiles.avatarUrl(profile) ?? null);
    const stats = statsRows[0];
    return resolveCollectionCreatorFace(id, {
      profileName: profile?.name ?? null,
      profileAvatarUrl: faceFromProfile,
      statsName: stats?.name ?? null,
      statsAvatar: stats?.avatar ?? null,
    });
  } catch {
    return { avatarUrl: null, displayName: null };
  }
}
