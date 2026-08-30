import type { Metadata } from 'next';
import { PostQuotesPanel } from '@/features/home/post-quotes-panel';
import { loadPostQuotesPageData } from '@/lib/load-post-quotes-page';

type GuildPostQuotesPageProps = {
  params: Promise<{
    groupId: string;
    author: string;
    postId: string;
  }>;
};

export async function generateMetadata({
  params,
}: GuildPostQuotesPageProps): Promise<Metadata> {
  const { author } = await params;

  return {
    title: `Quotes · @${decodeURIComponent(author)} · OnSocial`,
    description: 'Quotes and reposts of this guild post.',
  };
}

export default async function GuildPostQuotesPage({
  params,
}: GuildPostQuotesPageProps) {
  const { author, postId } = await params;
  const authorId = decodeURIComponent(author);
  const post = decodeURIComponent(postId);
  const initial = await loadPostQuotesPageData(authorId, post);

  return <PostQuotesPanel author={authorId} postId={post} initial={initial} />;
}
