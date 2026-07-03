import type { ComponentType } from 'react';
import {
  DotsCircleFillIcon,
  FireFillIcon,
  GlobeFillIcon,
  HomeFillIcon,
  SearchFillIcon,
  ShopFillIcon,
  UserCircleFillIcon,
  UsersFillIcon,
  type MageFillIconProps,
} from '@onsocial/ui';

const OS_APP_ICON_BY_ID: Record<string, ComponentType<MageFillIconProps>> = {
  home: HomeFillIcon,
  feed: DotsCircleFillIcon,
  discover: SearchFillIcon,
  market: ShopFillIcon,
  groups: UsersFillIcon,
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
