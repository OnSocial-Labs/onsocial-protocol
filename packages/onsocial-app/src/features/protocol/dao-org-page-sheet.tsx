'use client';

import type { ReactNode } from 'react';
import { useId } from 'react';
import { OsPageSheet, SheetHeader } from '@onsocial/ui';
import { useDaoPageMood } from '@/features/protocol/use-dao-page-mood';
import { SHEET_Z } from '@/lib/sheet-z';

/**
 * DAO org read overlays (Members, Treasury) — thin OsPageSheet page/appear
 * with SheetHeader ×, same family as compose / DropArtOverlay. Dock tucks.
 * Proposals stay a nested page with the summon dock visible. Edit / Boost
 * stay on `DaoPageSlideOverScreen`.
 *
 * GlassSheet already stays mounted through the exit animation — callers
 * should pass parent `open` / `onClose` through and not re-fire `onClose`
 * from `onClosed`.
 */
export function DaoOrgPageSheet({
  open,
  onClose,
  onClosed,
  daoAccountId,
  title,
  subtitle,
  closeAriaLabel,
  zIndex = SHEET_Z.list,
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
      dragDismiss={false}
      zIndex={zIndex}
      ariaLabelledBy={titleId}
      backdropLabel={closeAriaLabel}
      moodId={pageMood.moodId ?? undefined}
      moodStyle={pageMood.moodStyle}
      panelClassName={panelClass}
      bodyClassName="dao-org-page-body"
      header={
        <SheetHeader
          titleId={titleId}
          title={title}
          subtitle={resolvedSubtitle}
          onClose={onClose}
          closeAriaLabel={closeAriaLabel}
        />
      }
    >
      <div className={contentClass}>{children}</div>
    </OsPageSheet>
  );
}
