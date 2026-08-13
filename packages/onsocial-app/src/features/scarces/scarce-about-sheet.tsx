'use client';

import { useCallback, useId, useState } from 'react';
import Link from 'next/link';
import { Divider, GlassSheet, SheetHeader } from '@onsocial/ui';
import { SCARCE_Z } from '@/features/scarces/scarce-overlay-z';
import { useScrollLock } from '@/hooks/use-scroll-lock';

/**
 * Full scarce description — same job as CollectionAboutSheet for Drop play.
 */
export function ScarceAboutSheet({
  open,
  onClose,
  title,
  body,
  originalHref = null,
  zIndex = SCARCE_Z.nestedOverCommerce,
}: {
  open: boolean;
  onClose: () => void;
  title?: string | null;
  body: string;
  originalHref?: string | null;
  zIndex?: number;
}) {
  const titleId = useId();
  const [closing, setClosing] = useState(false);
  const sheetOpen = open && !closing;
  const trimmed = body.trim();
  const headerTitle = title?.trim() || 'About';

  useScrollLock(open || closing);

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
  }, [closing]);

  const handleClosed = useCallback(() => {
    setClosing(false);
    onClose();
  }, [onClose]);

  if (!trimmed && !open) return null;

  return (
    <GlassSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      tone="os"
      sizing="hug"
      initialDetent="full"
      peekRatio={1}
      zIndex={zIndex}
      presentation="swap"
      ariaLabelledBy={titleId}
      backdropLabel="Close about"
      panelClassName="guild-facts-sheet-panel"
      bodyClassName="guild-facts-sheet-body"
      header={
        <>
          <SheetHeader
            titleId={titleId}
            title="About"
            subtitle={headerTitle !== 'About' ? headerTitle : undefined}
            onClose={requestClose}
            closeAriaLabel="Close about"
          />
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
    >
      <div className="guild-facts collection-about-sheet">
        {trimmed ? (
          <p className="collection-about-body">{trimmed}</p>
        ) : null}
        {originalHref ? (
          <>
            {trimmed ? <Divider variant="detail" /> : null}
            <p className="scarce-provenance-original">
              <Link
                href={originalHref}
                scroll={false}
                className="scarce-provenance-original-link"
                onClick={requestClose}
              >
                View original post
              </Link>
            </p>
          </>
        ) : null}
      </div>
    </GlassSheet>
  );
}
