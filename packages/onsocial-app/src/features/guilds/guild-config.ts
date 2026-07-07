import { resolveProfileMediaUrl } from '@/lib/profile-display';

export interface GuildConfigSnapshot {
  name: string;
  description: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  accessGated: boolean;
  memberDriven: boolean;
  tags: string[];
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

function readNestedString(value: unknown, path: string[]): string | null {
  let cursor: unknown = value;
  for (const key of path) {
    if (typeof cursor !== 'object' || cursor === null) return null;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return readString(cursor);
}

export function normalizeGuildConfig(
  groupId: string,
  raw: Record<string, unknown>
): GuildConfigSnapshot {
  const rawTags = Array.isArray(raw.tags)
    ? raw.tags.filter((tag): tag is string => typeof tag === 'string')
    : [];
  const avatarCid = readNestedString(raw, ['avatar', 'cid']);
  const bannerCid = readNestedString(raw, ['x', 'onsocial', 'banner', 'cid']);

  return {
    name: readString(raw.name) ?? groupId,
    description: readString(raw.description) ?? '',
    avatarUrl: avatarCid
      ? resolveProfileMediaUrl(`ipfs://${avatarCid}`)
      : null,
    bannerUrl: bannerCid
      ? resolveProfileMediaUrl(`ipfs://${bannerCid}`)
      : null,
    accessGated: readBoolean(raw.is_private) || readBoolean(raw.isPrivate),
    memberDriven:
      readBoolean(raw.member_driven) || readBoolean(raw.memberDriven),
    tags: rawTags,
  };
}

export function normalizeGuildTagsInput(input: string): string[] {
  return input
    .split(',')
    .map((tag) =>
      tag
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
    )
    .filter(Boolean)
    .slice(0, 6);
}

export function guildTagsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((tag, index) => tag === b[index]);
}
