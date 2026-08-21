'use client';

import { usePathname, useRouter } from 'next/navigation';
import {
  NotificationBellFillIcon,
  NotificationBellPendingFillIcon,
} from '@onsocial/ui';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useNotificationsUnreadCount } from '@/components/providers/notifications-host';
import {
  APP_NOTIFICATIONS_PATH,
  notificationsPath,
} from '@/lib/app-routes';

/**
 * Dock Activity control — sits before the wallet zone.
 * Idle: compact bell. Unread: pending-fill bell + count expands into the pill.
 * Hidden until connected (inbox is account-scoped).
 */
export function OsDockActivityZone() {
  const { accountId, isConnected } = useAppWallet();
  const unread = useNotificationsUnreadCount();
  const pathname = usePathname();
  const router = useRouter();

  if (!isConnected || !accountId) return null;

  const hasUnread = unread > 0;
  const onActivity = pathname === APP_NOTIFICATIONS_PATH;
  const label = hasUnread
    ? `Activity, ${unread > 9 ? '9+' : unread} unread`
    : 'Activity';
  const Bell = hasUnread
    ? NotificationBellPendingFillIcon
    : NotificationBellFillIcon;

  return (
    <button
      type="button"
      className={`portfolio-summon-activity${hasUnread ? ' has-unread' : ''}${
        onActivity ? ' is-current' : ''
      }`}
      aria-label={label}
      aria-current={onActivity ? 'page' : undefined}
      title={label}
      onClick={() => router.push(notificationsPath())}
    >
      <Bell className="portfolio-summon-activity-icon" aria-hidden />
      <span
        className="portfolio-summon-activity-count"
        aria-hidden={!hasUnread}
      >
        {hasUnread ? (unread > 9 ? '9+' : unread) : null}
      </span>
    </button>
  );
}
