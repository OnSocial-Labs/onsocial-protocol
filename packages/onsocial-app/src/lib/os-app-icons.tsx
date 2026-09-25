import type { ComponentType } from 'react';
import {
  ChartFillIcon,
  FireFillIcon,
  GiftFillIcon,
  GlobeFillIcon,
  HomeFillIcon,
  MessageFillIcon,
  NotificationBellFillIcon,
  osLauncherItemIconRemoteClassName,
  SearchFillIcon,
  ShopFillIcon,
  StarMovingFillIcon,
  StarsCFillIcon,
  UserCircleFillIcon,
  UsersFillIcon,
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
  /** Orgs — distinct from Guilds (`UsersFillIcon`). */
  daos: ChartFillIcon,
  boost: FireFillIcon,
  protocol: GlobeFillIcon,
  page: UserCircleFillIcon,
  'my-page': UserCircleFillIcon,
};

export function OsAppIcon({
  appId,
  className,
  iconUrl,
}: {
  appId: string;
  className?: string;
  iconUrl?: string;
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
  const Icon =
    OS_APP_ICON_BY_ID[appId] ??
    (appId.startsWith('community:') ? GlobeFillIcon : HomeFillIcon);
  return <Icon className={className} aria-hidden />;
}
