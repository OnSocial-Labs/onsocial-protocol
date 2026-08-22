export type GuildCardRole = 'Owner' | 'Admin' | 'Moderator' | 'Member';

export type GuildCardMetaTag = {
  key: string;
  label: string;
  tone?: 'default' | 'role' | 'owner' | 'accent';
};

const RAW_GROUP_ID_RE = /^grp[_-][a-z0-9_.-]+$/i;

export function isRawGroupId(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (RAW_GROUP_ID_RE.test(trimmed)) return true;
  return trimmed.length > 28 && !trimmed.includes(' ');
}

export function guildDisplayName(
  name: string | null | undefined,
  groupId: string
): string {
  // Stored names sometimes embed the generated id ("MD grp_md_perm_…") —
  // drop raw-id words so only the human part survives.
  const cleaned = (name ?? '')
    .split(/\s+/)
    .filter((word) => word && !isRawGroupId(word) && word !== groupId)
    .join(' ')
    .trim();
  if (cleaned && !isRawGroupId(cleaned) && cleaned !== groupId) {
    return cleaned;
  }

  const suffix = groupId.split('_').pop()?.trim();
  if (suffix && suffix.length >= 4 && suffix.length <= 14) {
    return `Guild ${suffix}`;
  }

  if (groupId.length > 22) {
    return `${groupId.slice(0, 10)}…${groupId.slice(-5)}`;
  }

  return groupId;
}

export function guildDisplayInitials(
  name: string | null | undefined,
  groupId: string
): string {
  const displayName = guildDisplayName(name, groupId);
  const words = displayName
    .split(/[\s#._-]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !/^guild$/i.test(part));

  if (words.length >= 2) {
    return `${words[0]![0] ?? ''}${words[1]![0] ?? ''}`.toUpperCase();
  }

  if (words.length === 1) {
    const word = words[0]!;
    return word.slice(0, 2).toUpperCase();
  }

  return 'G';
}

export function guildRoleFromFlags(input: {
  isOwner?: boolean;
  isAdmin?: boolean;
  canModerate?: boolean;
}): GuildCardRole {
  if (input.isOwner) return 'Owner';
  if (input.isAdmin) return 'Admin';
  if (input.canModerate) return 'Moderator';
  return 'Member';
}

export function guildRoleBadgeLabel(
  role: GuildCardRole | null | undefined
): string | null {
  if (!role || role === 'Member') return null;
  return role;
}

/** Single membership/governance mode — never stack access + collaborative. */
export type GuildModeId = 'open' | 'invite' | 'member-led';

export function guildModeId(input: {
  accessGated: boolean;
  memberDriven: boolean;
}): GuildModeId {
  if (input.memberDriven) return 'member-led';
  if (input.accessGated) return 'invite';
  return 'open';
}

export function guildModeLabel(input: {
  accessGated: boolean;
  memberDriven: boolean;
}): string {
  switch (guildModeId(input)) {
    case 'member-led':
      return 'Member-led';
    case 'invite':
      return 'Invite only';
    case 'open':
      return 'Open';
  }
}

/** One-line explainers for guild facts sheet / mode chips. */
export function guildModeDescription(input: {
  accessGated: boolean;
  memberDriven: boolean;
}): string {
  switch (guildModeId(input)) {
    case 'member-led':
      return 'Invite only. Joins and major changes go through member proposals.';
    case 'invite':
      return 'Anyone can view; joining and posting need approval.';
    case 'open':
      return 'Anyone can join and post. Activity stays public.';
  }
}

export function guildCardMetaTags(input: {
  role?: GuildCardRole | null;
  accessGated: boolean;
  memberDriven: boolean;
}): GuildCardMetaTag[] {
  const tags: GuildCardMetaTag[] = [];
  const roleLabel = guildRoleBadgeLabel(input.role);
  if (roleLabel) {
    tags.push({
      key: 'role',
      label: roleLabel,
      tone: input.role === 'Owner' ? 'owner' : 'role',
    });
  }

  const mode = guildModeId(input);
  tags.push({
    key: 'mode',
    label: guildModeLabel(input),
    tone: mode === 'member-led' ? 'accent' : 'default',
  });
  return tags;
}

export function formatGuildMemberCountParts(count: number): {
  value: string;
  label: string;
} {
  const safe = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  return {
    value: safe.toLocaleString(),
    label: safe === 1 ? 'member' : 'members',
  };
}

export function formatGuildMemberCount(count: number): string {
  const { value, label } = formatGuildMemberCountParts(count);
  return `${value} ${label}`;
}
