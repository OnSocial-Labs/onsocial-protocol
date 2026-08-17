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
  const map = await fetchCollectionCreatorFaces(client, [creatorId]);
  return map.get(creatorId.trim()) ?? { avatarUrl: null, displayName: null };
}

/** Batch creator faces for list rows (getMany + stats). Soft-fails per account. */
export async function fetchCollectionCreatorFaces(
  client: OnSocial,
  creatorIds: ReadonlyArray<string>
): Promise<Map<string, CollectionCreatorFace>> {
  const ids = [
    ...new Set(creatorIds.map((id) => id.trim()).filter(Boolean)),
  ];
  const out = new Map<string, CollectionCreatorFace>();
  if (ids.length === 0) return out;
  try {
    const [profiles, statsRows] = await Promise.all([
      client.profiles.getMany(ids),
      client.query.profiles.statsForAccounts(ids),
    ]);
    const statsById = new Map(
      statsRows.map((row) => [row.accountId.trim(), row] as const)
    );
    for (const id of ids) {
      const profile = profiles[id];
      const media = profile ? client.profiles.avatarMedia(profile) : null;
      const faceFromProfile =
        media?.kind === 'image'
          ? media.url
          : (media?.poster ??
            (profile ? client.profiles.avatarUrl(profile) : null) ??
            null);
      const stats = statsById.get(id);
      out.set(
        id,
        resolveCollectionCreatorFace(id, {
          profileName: profile?.name ?? null,
          profileAvatarUrl: faceFromProfile,
          statsName: stats?.name ?? null,
          statsAvatar: stats?.avatar ?? null,
        })
      );
    }
  } catch {
    for (const id of ids) {
      if (!out.has(id)) out.set(id, { avatarUrl: null, displayName: null });
    }
  }
  return out;
}
