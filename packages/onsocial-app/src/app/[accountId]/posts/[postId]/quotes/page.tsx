import type { Metadata } from 'next';
import { PostQuotesPanel } from '@/features/home/post-quotes-panel';
import { POST_REACH_TITLE } from '@/lib/post-reach-title';
import { loadPostQuotesPageData } from '@/lib/load-post-quotes-page';
import { readPostQuotesTabValue } from '@/lib/post-routes';
import { resolveAccountId } from '@/lib/resolve-account';

type PersonalPostQuotesPageProps = {
  params: Promise<{
    accountId: string;
    postId: string;
  }>;
  searchParams: Promise<{
    tab?: string | string[];
  }>;
};

export async function generateMetadata({
  params,
}: PersonalPostQuotesPageProps): Promise<Metadata> {
  const accountId = await resolveAccountId(params);

  return {
    title: `${POST_REACH_TITLE} · @${accountId} · OnSocial`,
    description: `Quotes and reposts of @${accountId}'s post.`,
  };
}

export default async function PersonalPostQuotesPage({
  params,
  searchParams,
}: PersonalPostQuotesPageProps) {
  const [accountId, { postId: rawPostId }, tabParam] = await Promise.all([
    resolveAccountId(params),
    params,
    searchParams,
  ]);
  const postId = decodeURIComponent(rawPostId);
  const initialTab = readPostQuotesTabValue(tabParam.tab);
  const initial = await loadPostQuotesPageData(accountId, postId);

  return (
    <PostQuotesPanel
      author={accountId}
      postId={postId}
      initial={initial}
      initialTab={initialTab}
    />
  );
}
