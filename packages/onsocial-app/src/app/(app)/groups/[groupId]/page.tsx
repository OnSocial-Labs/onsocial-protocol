import type { Metadata } from 'next';
import {
  getGuildBlueprint,
  GUILD_PRODUCT_COPY,
} from '@/features/guilds/guilds-data';
import { LiveGuildPanel } from '@/features/guilds/live-guild-panel';

type GuildPageProps = {
  params: Promise<{
    groupId: string;
  }>;
};

export async function generateMetadata({
  params,
}: GuildPageProps): Promise<Metadata> {
  const { groupId } = await params;
  const guild = getGuildBlueprint(decodeURIComponent(groupId));

  return {
    title: `${guild.name} • ${GUILD_PRODUCT_COPY.title} • OnSocial`,
    description: guild.summary,
  };
}

export default async function GuildPage({ params }: GuildPageProps) {
  const { groupId } = await params;
  return <LiveGuildPanel groupId={decodeURIComponent(groupId)} />;
}
