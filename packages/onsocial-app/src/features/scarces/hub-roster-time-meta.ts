import { formatSocialCalendarTime, normalizeSocialTimestamp } from '@onsocial/ui';

export function hubRosterTimeMeta(
  addedAtNs: number | null | undefined,
  role: 'owner' | 'moderator' | 'approved_creator'
): { label: string; description: string } | null {
  const joined = normalizeSocialTimestamp(addedAtNs);
  if (!joined) return null;

  const calendar = formatSocialCalendarTime(joined);
  if (!calendar) return null;

  const prefix =
    role === 'owner'
      ? 'Owner since'
      : role === 'moderator'
        ? 'Moderator since'
        : 'Creator since';
  return {
    label: calendar.label,
    description: `${prefix} ${calendar.title}`,
  };
}
