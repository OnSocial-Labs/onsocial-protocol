import { isValidElement, type ReactNode } from 'react';
import { cleanHandle } from '@/lib/endorsements';

/** Roughly matches short static labels like "Transparency" (13 chars). */
export const NAV_BADGE_LABEL_MAX = 13;

export function truncateNavBadgeLabel(
  label: string,
  max = NAV_BADGE_LABEL_MAX
): string {
  const trimmed = label.trim();
  if (trimmed.length <= max) return trimmed;
  if (max <= 1) return '…';
  return `${trimmed.slice(0, max - 1)}…`;
}

export function formatProfilePageNavLabel(options: {
  isSelf: boolean;
  accountId: string;
  displayName?: string | null;
  profileLoaded?: boolean;
}): string {
  const { isSelf, accountId, displayName, profileLoaded = false } = options;

  if (isSelf) return 'Profile';

  if (profileLoaded && displayName?.trim()) {
    return truncateNavBadgeLabel(displayName.trim());
  }

  return truncateNavBadgeLabel(`@${cleanHandle(accountId)}`);
}

/** Nav renders its own PortalBadge — pass a plain label, not a nested badge. */
export function resolveNavBadgeLabel(badge: ReactNode): ReactNode {
  if (badge == null || typeof badge === 'string' || typeof badge === 'number') {
    return badge;
  }

  if (isValidElement<{ children?: ReactNode }>(badge)) {
    const { children } = badge.props;
    if (typeof children === 'string' || typeof children === 'number') {
      return children;
    }
  }

  return badge;
}
