'use client';

import type { ReactNode } from 'react';
import { useId } from 'react';
import { OsPageSheet } from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { useDaoPageMood } from '@/features/protocol/use-dao-page-mood';
import { daoPortfolioPath } from '@/lib/app-routes';

/**
 * DAO org read pages (Members, Treasury) — same OsPageSheet + embedded
 * OsAppScreen as Proposals. Edit / Boost stay on `DaoPageSlideOverScreen`.
 *
 * z-index 45 sits under the page drawer (48) and summon dock (49) so
 * keepDock + dockBack stay clickable.
 */
export const DAO_ORG_PAGE_Z = 45;

export function DaoOrgPageSheet({
  open,
  onClose,
  onClosed,
  daoAccountId,
  title,
  subtitle,
  closeAriaLabel,
  zIndex = DAO_ORG_PAGE_Z,
  panelClassName,
  contentClassName,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onClosed?: () => void;
  daoAccountId: string;
  title: string;
  subtitle?: string;
  closeAriaLabel: string;
  zIndex?: number;
  panelClassName?: string;
  contentClassName?: string;
  children: ReactNode;
}) {
  const titleId = useId();
  const pageMood = useDaoPageMood(daoAccountId, open);
  const resolvedSubtitle = subtitle?.trim() || undefined;
  const panelClass = ['dao-org-page', panelClassName].filter(Boolean).join(' ');
  const contentClass = ['dao-org-page-content', contentClassName]
    .filter(Boolean)
    .join(' ');

  return (
    <OsPageSheet
      open={open}
      onClose={onClose}
      onClosed={onClosed}
      surface="page"
      presentation="appear"
      keepDock
      dragDismiss={false}
      zIndex={zIndex}
      ariaLabelledBy={titleId}
      backdropLabel={closeAriaLabel}
      moodId={pageMood.moodId ?? undefined}
      moodStyle={pageMood.moodStyle}
      panelClassName={panelClass}
      bodyClassName="dao-org-page-body"
      header={null}
    >
      <OsAppScreen
        title={title}
        subtitle={resolvedSubtitle}
        glassChrome
        compactChrome
        embedded
        dockBack
        onDockBack={onClose}
        backFallbackHref={daoPortfolioPath(daoAccountId)}
        leading={null}
        moodId={pageMood.moodId}
        moodStyle={pageMood.moodStyle}
      >
        <span id={titleId} className="sr-only">
          {title}
        </span>
        <div className={contentClass}>{children}</div>
      </OsAppScreen>
    </OsPageSheet>
  );
}
