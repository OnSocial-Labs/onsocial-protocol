'use client';

import type { ReactNode } from 'react';
import { OsHugSheet } from '@onsocial/ui';
import { useDaoPageMood } from '@/features/protocol/use-dao-page-mood';
import { SHEET_Z } from '@/lib/sheet-z';

/**
 * DAO org read drawers (Members, Treasury) — full-detent OsHugSheet, same
 * family as guild members / fans. Face stays underneath. Proposals stay a
 * nested keep-dock page. Edit / Boost stay on `DaoPageSlideOverScreen`.
 *
 * GlassSheet already stays mounted through the exit animation — callers
 * should pass parent `open` / `onClose` through and not re-fire `onClose`
 * from `onClosed`.
 */
export function DaoOrgHugSheet({
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
  footer,
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
  /** Pinned hug footer (e.g. Members stake CTA) — same slot as other drawers. */
  footer?: ReactNode;
  children: ReactNode;
}) {
  const pageMood = useDaoPageMood(daoAccountId, open);
  const resolvedCopy = subtitle?.trim() || undefined;
  const panelClass = ['dao-org-hug', 'os-sheet-cap-standard', panelClassName]
    .filter(Boolean)
    .join(' ');
  const contentClass = ['dao-org-hug-content', contentClassName]
    .filter(Boolean)
    .join(' ');

  return (
    <OsHugSheet
      open={open}
      onClose={onClose}
      onClosed={onClosed}
      label={title}
      copy={resolvedCopy}
      closeAriaLabel={closeAriaLabel}
      zIndex={zIndex}
      chrome="plain"
      sizing="hug"
      initialDetent="full"
      moodId={pageMood.moodId ?? undefined}
      panelStyle={pageMood.moodStyle}
      panelClassName={panelClass}
      bodyClassName="dao-org-hug-body"
      footer={footer}
    >
      <div className={contentClass}>{children}</div>
    </OsHugSheet>
  );
}
