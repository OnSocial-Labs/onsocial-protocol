import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LivePersonalPostPanel } from '@/features/home/live-personal-post-panel';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';
import { fetchIndexedPost } from '@/lib/fetch-personal-post';
import { loadPersonalPostPageData } from '@/lib/load-personal-post-page';
import { postThreadPath } from '@/lib/post-routes';
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
  if (!initial) {
    try {
      const indexed = await fetchIndexedPost(
        { author: accountId, postId },
        createServerOnSocialClient()
      );
      if (indexed?.groupId) {
        redirect(postThreadPath(indexed));
      }
    } catch {
      // Client panel hydrates when SSR indexer is missing or unauthenticated.
    }
  }

  return (
    <LivePersonalPostPanel
      author={accountId}
      postId={postId}
      initial={initial}
    />
  );
}
