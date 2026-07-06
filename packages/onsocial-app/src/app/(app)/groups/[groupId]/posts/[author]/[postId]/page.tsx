import type { Metadata } from 'next';
import { getGuildBlueprint } from '@/features/guilds/guilds-data';
import { LiveGuildPostPanel } from '@/features/guilds/live-guild-post-panel';

type GuildPostPageProps = {
  params: Promise<{
    groupId: string;
    author: string;
    postId: string;
  }>;
};

export async function generateMetadata({
  params,
}: GuildPostPageProps): Promise<Metadata> {
  const { groupId } = await params;
  const guild = getGuildBlueprint(decodeURIComponent(groupId));

  return {
    title: `${guild.name} Thread • OnSocial`,
    description: `Threaded discussion in ${guild.name}.`,
  };
}

export default async function GuildPostPage({ params }: GuildPostPageProps) {
  const { groupId, author, postId } = await params;

  return (
    <LiveGuildPostPanel
      groupId={decodeURIComponent(groupId)}
      author={decodeURIComponent(author)}
      postId={decodeURIComponent(postId)}
    />
  );
}
