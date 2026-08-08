import type { Metadata } from 'next';
import {
  getGuildBlueprint,
  GUILD_PRODUCT_COPY,
} from '@/features/guilds/guilds-data';
import { LiveGuildPanel } from '@/features/guilds/live-guild-panel';
import { loadGuildPageData } from '@/lib/load-guild-page';

type GuildPageProps = {
  params: Promise<{
    groupId: string;
  }>;
};

export async function generateMetadata({
  params,
}: GuildPageProps): Promise<Metadata> {
  const { groupId } = await params;
  const id = decodeURIComponent(groupId);
  const initial = await loadGuildPageData(id);
  if (initial) {
    return {
      title: `${initial.config.name} • ${GUILD_PRODUCT_COPY.title} • OnSocial`,
      ...(initial.config.description
        ? { description: initial.config.description }
        : { description: GUILD_PRODUCT_COPY.subtitle }),
    };
  }
  const guild = getGuildBlueprint(id);
  return {
    title: `${guild.name} • ${GUILD_PRODUCT_COPY.title} • OnSocial`,
    description: guild.summary,
  };
}

export default async function GuildPage({ params }: GuildPageProps) {
  const { groupId } = await params;
  const id = decodeURIComponent(groupId);
  const initial = await loadGuildPageData(id);
  return <LiveGuildPanel groupId={id} initial={initial} />;
}
