import type { Metadata } from 'next';
import { PostQuotesPanel } from '@/features/home/post-quotes-panel';
import { loadPostQuotesPageData } from '@/lib/load-post-quotes-page';
import { resolveAccountId } from '@/lib/resolve-account';

type PersonalPostQuotesPageProps = {
  params: Promise<{
    accountId: string;
    postId: string;
  }>;
};

export async function generateMetadata({
  params,
}: PersonalPostQuotesPageProps): Promise<Metadata> {
  const accountId = await resolveAccountId(params);

  return {
    title: `Quotes · @${accountId} · OnSocial`,
    description: `Quotes and reposts of @${accountId}'s post.`,
  };
}

export default async function PersonalPostQuotesPage({
  params,
}: PersonalPostQuotesPageProps) {
  const accountId = await resolveAccountId(params);
  const { postId: rawPostId } = await params;
  const postId = decodeURIComponent(rawPostId);
  const initial = await loadPostQuotesPageData(accountId, postId);

  return (
    <PostQuotesPanel author={accountId} postId={postId} initial={initial} />
  );
}
