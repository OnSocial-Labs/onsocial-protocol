'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { Divider, OsHugSheet } from '@onsocial/ui';
import { SCARCE_Z } from '@/features/scarces/scarce-overlay-z';

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
  const [closing, setClosing] = useState(false);
  const sheetOpen = open && !closing;
  const trimmed = body.trim();
  const headerTitle = title?.trim() || 'About';

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
    <OsHugSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      label="About"
      {...(headerTitle !== 'About' ? { copy: headerTitle } : {})}
      closeAriaLabel="Close about"
      backdropLabel="Close about"
      zIndex={zIndex}
      presentation="swap"
      panelClassName="guild-facts-sheet-panel"
      bodyClassName="guild-facts-sheet-body"
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
    </OsHugSheet>
  );
}
