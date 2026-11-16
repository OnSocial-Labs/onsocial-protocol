'use client';

import { useParams } from 'next/navigation';
import { PostThreadRouteLoading } from '@/features/home/post-thread-route-loading';
import { guildPath } from '@/features/guilds/guilds-data';
import { APP_HOME_PATH } from '@/lib/app-routes';

function groupIdFromParams(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export default function GuildPostLoading() {
  const params = useParams<{ groupId?: string | string[] }>();
  const groupId = groupIdFromParams(params.groupId);
  return (
    <PostThreadRouteLoading
      backHref={groupId ? guildPath(groupId) : APP_HOME_PATH}
    />
  );
}
