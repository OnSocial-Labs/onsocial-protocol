'use client';

import type { ComponentProps } from 'react';
import { OsSlideOverScreen } from '@/components/app/os-slide-over-screen';
import { useDaoPageMood } from '@/features/protocol/use-dao-page-mood';

/**
 * DAO org slide-overs on a portfolio face — inherit that page's mood wash,
 * not the connected viewer's wallet mood.
 */
export function DaoPageSlideOverScreen({
  pageAccountId,
  open,
  ...props
}: ComponentProps<typeof OsSlideOverScreen> & {
  pageAccountId: string;
}) {
  const { moodId, moodStyle } = useDaoPageMood(pageAccountId, open);

  return (
    <OsSlideOverScreen
      {...props}
      open={open}
      moodId={moodId}
      moodStyle={moodStyle}
    />
  );
}
