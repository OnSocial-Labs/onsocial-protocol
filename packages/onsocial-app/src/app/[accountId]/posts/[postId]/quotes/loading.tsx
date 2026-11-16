'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { PostQuotesRouteLoading } from '@/features/home/post-quotes-route-loading';
import { postThreadPath, readPostQuotesTab } from '@/lib/post-routes';

function PersonalPostQuotesLoadingFromSearch() {
  const params = useParams<{ accountId: string; postId: string }>();
  const searchParams = useSearchParams();
  const accountId = decodeURIComponent(String(params.accountId ?? ''));
  const postId = decodeURIComponent(String(params.postId ?? ''));

  return (
    <PostQuotesRouteLoading
      backHref={postThreadPath({ accountId, postId })}
      activeTab={readPostQuotesTab(searchParams)}
    />
  );
}

export default function PersonalPostQuotesLoading() {
  return (
    <Suspense fallback={null}>
      <PersonalPostQuotesLoadingFromSearch />
    </Suspense>
  );
}
