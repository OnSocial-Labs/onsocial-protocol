'use client';

import { usePathname, useRouter } from 'next/navigation';
import {
  Divider,
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
 * Dock Activity — same section cell + icon box as compose (centered).
 * Idle: Mage bell-fill. Unread: Mage pending-fill with green corner dot.
 */
export function OsDockActivityZone() {
  const { accountId, isConnected } = useAppWallet();
  const unread = useNotificationsUnreadCount();
  const pathname = usePathname();
  const router = useRouter();

  if (!isConnected || !accountId) return null;

  const hasUnread = unread > 0;
  const onActivity = pathname === APP_NOTIFICATIONS_PATH;
  const countLabel = unread > 9 ? '9+' : String(unread);
  const label = hasUnread ? `Activity, ${countLabel} unread` : 'Activity';
  const iconClass = 'portfolio-summon-compose-icon';

  return (
    <>
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
        {hasUnread ? (
          <NotificationBellPendingFillIcon
            className={iconClass}
            badgeFill="var(--protocol-green)"
            aria-hidden
          />
        ) : (
          <NotificationBellFillIcon className={iconClass} aria-hidden />
        )}
      </button>
      <Divider
        orientation="vertical"
        variant="detail"
        className="portfolio-summon-divider"
      />
    </>
  );
}
