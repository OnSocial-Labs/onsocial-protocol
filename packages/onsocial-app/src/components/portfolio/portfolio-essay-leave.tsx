'use client';

import { Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRegisterDockBack } from '@/contexts/dock-chrome-context';
import { rememberEssayReopen } from '@/lib/essay-return';
import {
  essayLeaveHref,
  parsePortfolioEssayFromParam,
  parsePortfolioEssayParam,
  parseWritingArticleHref,
  PORTFOLIO_ESSAY_FROM_PARAM,
  PORTFOLIO_ESSAY_PARAM,
} from '@/lib/overlay-routes';

function PortfolioEssayLeaveInner({ accountId }: { accountId: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const essayId = parsePortfolioEssayParam(search.get(PORTFOLIO_ESSAY_PARAM));
  const fromHref = parsePortfolioEssayFromParam(
    search.get(PORTFOLIO_ESSAY_FROM_PARAM)
  );
  const leaveHref = essayId
    ? essayLeaveHref(accountId, essayId, fromHref)
    : null;
  const entry = useMemo(
    () =>
      essayId && leaveHref
        ? {
            fallbackHref: leaveHref,
            ariaLabel: 'Back',
            onBack: () => {
              if (fromHref && !parseWritingArticleHref(fromHref)) {
                rememberEssayReopen({ accountId, postId: essayId });
              }
              router.push(leaveHref);
            },
          }
        : null,
    [accountId, essayId, fromHref, leaveHref, router]
  );
  useRegisterDockBack(entry);
  return null;
}

/** Face or Writing opened from an article — dock chevron is that reader. */
export function PortfolioEssayLeave({ accountId }: { accountId: string }) {
  return (
    <Suspense fallback={null}>
      <PortfolioEssayLeaveInner accountId={accountId} />
    </Suspense>
  );
}
