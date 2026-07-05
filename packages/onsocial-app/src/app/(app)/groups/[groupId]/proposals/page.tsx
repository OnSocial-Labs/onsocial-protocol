import type { Metadata } from 'next';
import { getGuildBlueprint } from '@/features/guilds/guilds-data';
import { GuildProposalsPanel } from '@/features/guilds/guilds-panels';

type GuildProposalsPageProps = {
  params: Promise<{
    groupId: string;
  }>;
};

export async function generateMetadata({
  params,
}: GuildProposalsPageProps): Promise<Metadata> {
  const { groupId } = await params;
  const guild = getGuildBlueprint(decodeURIComponent(groupId));

  return {
    title: `${guild.name} Proposals • OnSocial`,
    description: `Guild proposals and collaborative governance for ${guild.name}.`,
  };
}

export default async function GuildProposalsPage({
  params,
}: GuildProposalsPageProps) {
  const { groupId } = await params;
  return <GuildProposalsPanel groupId={decodeURIComponent(groupId)} />;
}
