import type { ComponentType } from 'react';
import {
  ChartFillIcon,
  DotsCircleFillIcon,
  FireFillIcon,
  GlobeFillIcon,
  HomeFillIcon,
  MessageFillIcon,
  SearchFillIcon,
  ShopFillIcon,
  StarMovingFillIcon,
  UserCircleFillIcon,
  UsersFillIcon,
  type MageFillIconProps,
} from '@onsocial/ui';

const OS_APP_ICON_BY_ID: Record<string, ComponentType<MageFillIconProps>> = {
  home: HomeFillIcon,
  feed: DotsCircleFillIcon,
  activity: DotsCircleFillIcon,
  messages: MessageFillIcon,
  discover: SearchFillIcon,
  market: ShopFillIcon,
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
}: {
  appId: string;
  className?: string;
}) {
  const Icon = OS_APP_ICON_BY_ID[appId] ?? HomeFillIcon;
  return <Icon className={className} aria-hidden />;
}
