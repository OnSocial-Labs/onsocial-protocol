'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { PostQuotesRouteLoading } from '@/features/home/post-quotes-route-loading';
import { postThreadPath, readPostQuotesTab } from '@/lib/post-routes';

function GuildPostQuotesLoadingFromSearch() {
  const params = useParams<{
    groupId: string;
    author: string;
    postId: string;
  }>();
  const searchParams = useSearchParams();
  const groupId = decodeURIComponent(String(params.groupId ?? ''));
  const accountId = decodeURIComponent(String(params.author ?? ''));
  const postId = decodeURIComponent(String(params.postId ?? ''));

  return (
    <PostQuotesRouteLoading
      backHref={postThreadPath({ accountId, postId, groupId })}
      activeTab={readPostQuotesTab(searchParams)}
    />
  );
}

export default function GuildPostQuotesLoading() {
  return (
    <Suspense fallback={null}>
      <GuildPostQuotesLoadingFromSearch />
    </Suspense>
  );
}
