import { formatSocialCalendarTime, normalizeSocialTimestamp } from '@onsocial/ui';

export function guildMemberTimeMeta(
  blockTimestamp: number | null | undefined,
  options: { isOwner?: boolean } = {}
): { label: string; prefix: string; description: string } | null {
  const joined = normalizeSocialTimestamp(blockTimestamp);
  if (!joined) return null;

  const calendar = formatSocialCalendarTime(joined);
  if (!calendar) return null;

  const prefix = options.isOwner ? 'Member since' : 'Joined';
  return {
    label: calendar.label,
    prefix,
    description: `${prefix} ${calendar.title}`,
  };
}
