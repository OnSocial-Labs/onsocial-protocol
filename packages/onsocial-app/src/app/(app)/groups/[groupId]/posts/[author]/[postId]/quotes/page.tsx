import type { Metadata } from 'next';
import { PostQuotesPanel } from '@/features/home/post-quotes-panel';
import { POST_REACH_TITLE } from '@/lib/post-reach-title';
import { loadPostQuotesPageData } from '@/lib/load-post-quotes-page';
import { readPostQuotesTabValue } from '@/lib/post-routes';

type GuildPostQuotesPageProps = {
  params: Promise<{
    groupId: string;
    author: string;
    postId: string;
  }>;
  searchParams: Promise<{
    tab?: string | string[];
  }>;
};

export async function generateMetadata({
  params,
}: GuildPostQuotesPageProps): Promise<Metadata> {
  const { author } = await params;

  return {
    title: `${POST_REACH_TITLE} · @${decodeURIComponent(author)} · OnSocial`,
    description: 'Quotes and reposts of this guild post.',
  };
}

export default async function GuildPostQuotesPage({
  params,
  searchParams,
}: GuildPostQuotesPageProps) {
  const [{ author, postId }, tabParam] = await Promise.all([
    params,
    searchParams,
  ]);
  const authorId = decodeURIComponent(author);
  const post = decodeURIComponent(postId);
  const initialTab = readPostQuotesTabValue(tabParam.tab);
  const initial = await loadPostQuotesPageData(authorId, post);

  return (
    <PostQuotesPanel
      author={authorId}
      postId={post}
      initial={initial}
      initialTab={initialTab}
    />
  );
}
