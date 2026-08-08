import type { Metadata } from 'next';
import { getGuildBlueprint } from '@/features/guilds/guilds-data';
import { LiveGuildPostPanel } from '@/features/guilds/live-guild-post-panel';
import { loadGuildPostPageData } from '@/lib/load-guild-post-page';

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
  const { groupId, author, postId } = await params;
  const id = decodeURIComponent(groupId);
  const initial = await loadGuildPostPageData(
    id,
    decodeURIComponent(author),
    decodeURIComponent(postId)
  );
  const name = initial?.guildName ?? getGuildBlueprint(id).name;

  return {
    title: `${name} Thread • OnSocial`,
    description: `Threaded discussion in ${name}.`,
  };
}

export default async function GuildPostPage({ params }: GuildPostPageProps) {
  const { groupId, author, postId } = await params;
  const id = decodeURIComponent(groupId);
  const authorId = decodeURIComponent(author);
  const post = decodeURIComponent(postId);
  const initial = await loadGuildPostPageData(id, authorId, post);

  return (
    <LiveGuildPostPanel
      groupId={id}
      author={authorId}
      postId={post}
      initial={initial}
    />
  );
}
