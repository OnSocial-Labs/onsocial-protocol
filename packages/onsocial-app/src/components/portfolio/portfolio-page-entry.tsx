'use client';

import { OsIconAction } from '@onsocial/ui';

/** Keyboard and pointer path into the portfolio page drawer. */
export function PortfolioPageContentEntry({ onOpen }: { onOpen: () => void }) {
  return (
    <OsIconAction
      ariaLabel="Open page"
      className="portfolio-summon-hint"
      onClick={onOpen}
    >
      Open page
    </OsIconAction>
  );
}
