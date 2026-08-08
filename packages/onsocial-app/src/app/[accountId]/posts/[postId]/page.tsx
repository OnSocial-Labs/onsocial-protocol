import type { Metadata } from 'next';
import { LivePersonalPostPanel } from '@/features/home/live-personal-post-panel';
import { loadPersonalPostPageData } from '@/lib/load-personal-post-page';
import { resolveAccountId } from '@/lib/resolve-account';

type PersonalPostPageProps = {
  params: Promise<{
    accountId: string;
    postId: string;
  }>;
};

export async function generateMetadata({
  params,
}: PersonalPostPageProps): Promise<Metadata> {
  const accountId = await resolveAccountId(params);

  return {
    title: `Post · @${accountId} · OnSocial`,
    description: `Threaded discussion on @${accountId}'s post.`,
  };
}

export default async function PersonalPostPage({
  params,
}: PersonalPostPageProps) {
  const accountId = await resolveAccountId(params);
  const { postId: rawPostId } = await params;
  const postId = decodeURIComponent(rawPostId);
  const initial = await loadPersonalPostPageData(accountId, postId);

  return (
    <LivePersonalPostPanel
      author={accountId}
      postId={postId}
      initial={initial}
    />
  );
}
