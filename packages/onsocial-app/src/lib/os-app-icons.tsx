import type { ComponentType } from 'react';
import {
  DashboardFillIcon,
  DashboardIcon,
  FireFillIcon,
  FireIcon,
  GiftFillIcon,
  GiftIcon,
  GlobeFillIcon,
  GlobeIcon,
  HomeFillIcon,
  HomeIcon,
  MessageFillIcon,
  MessageRoundIcon,
  NotificationBellFillIcon,
  NotificationBellIcon,
  osLauncherItemIconRemoteClassName,
  SearchFillIcon,
  SearchIcon,
  ShopFillIcon,
  ShopIcon,
  StarMovingFillIcon,
  StarMovingIcon,
  StarsCFillIcon,
  StarsCIcon,
  UserCircleFillIcon,
  UserCircleIcon,
  UsersFillIcon,
  UsersIcon,
  type MageFillIconProps,
} from '@onsocial/ui';

const OS_APP_ICON_BY_ID: Record<string, ComponentType<MageFillIconProps>> = {
  home: HomeFillIcon,
  activity: NotificationBellFillIcon,
  messages: MessageFillIcon,
  discover: SearchFillIcon,
  market: ShopFillIcon,
  drops: StarsCFillIcon,
  collectibles: GiftFillIcon,
  hubs: StarMovingFillIcon,
  /** @deprecated alias — prefer `hubs` */
  stores: StarMovingFillIcon,
  groups: UsersFillIcon,
  /** Orgs — four panes, distinct from Guilds (`UsersFillIcon`). */
  daos: DashboardFillIcon,
  boost: FireFillIcon,
  protocol: GlobeFillIcon,
  page: UserCircleFillIcon,
  'my-page': UserCircleFillIcon,
};

const OS_APP_STROKE_ICON_BY_ID: Record<string, ComponentType<MageFillIconProps>> = {
  home: HomeIcon,
  activity: NotificationBellIcon,
  messages: MessageRoundIcon,
  discover: SearchIcon,
  market: ShopIcon,
  drops: StarsCIcon,
  collectibles: GiftIcon,
  hubs: StarMovingIcon,
  stores: StarMovingIcon,
  groups: UsersIcon,
  daos: DashboardIcon,
  boost: FireIcon,
  protocol: GlobeIcon,
  page: UserCircleIcon,
  'my-page': UserCircleIcon,
};

export function OsAppIcon({
  appId,
  className,
  iconUrl,
  filled = true,
}: {
  appId: string;
  className?: string;
  iconUrl?: string;
  /** Quiet launcher tiles use the stroke. The current app stays filled. */
  filled?: boolean;
}) {
  if (iconUrl) {
    return (
      <img
        src={iconUrl}
        alt=""
        className={[className, osLauncherItemIconRemoteClassName]
          .filter(Boolean)
          .join(' ')}
        draggable={false}
      />
    );
  }
  const icons = filled ? OS_APP_ICON_BY_ID : OS_APP_STROKE_ICON_BY_ID;
  const Icon =
    icons[appId] ??
    OS_APP_ICON_BY_ID[appId] ??
    (appId.startsWith('community:') ? GlobeFillIcon : HomeFillIcon);
  return <Icon className={className} aria-hidden />;
}
