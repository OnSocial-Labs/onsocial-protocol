'use client';

import { ChevronUpIcon, OsIconAction, osDockPillClassName } from '@onsocial/ui';

/** Opens the portfolio page drawer. Stays mounted while the drawer is open. */
export function PortfolioPageContentEntry({
  open,
  concealed,
  covered,
  onOpen,
}: {
  open: boolean;
  /** Hidden from keyboard and the accessibility tree while the sheet trap is up. */
  concealed: boolean;
  /** Floating box would cover page content, so the control is not shown. */
  covered: boolean;
  onOpen: () => void;
}) {
  const quiet = concealed || covered;
  return (
    <OsIconAction
      ariaLabel="Open page"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-hidden={quiet ? true : undefined}
      tabIndex={quiet ? -1 : undefined}
      hidden={covered || undefined}
      className={`${osDockPillClassName} portfolio-page-chevron`}
      onClick={onOpen}
    >
      <ChevronUpIcon aria-hidden />
    </OsIconAction>
  );
}
