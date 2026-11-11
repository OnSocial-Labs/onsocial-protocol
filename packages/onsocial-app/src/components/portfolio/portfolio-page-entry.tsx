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
  /** Floating box would cover page content. Hidden from the pointer, still reachable by keyboard. */
  covered: boolean;
  onOpen: () => void;
}) {
  return (
    <OsIconAction
      ariaLabel="Open page"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-hidden={concealed ? true : undefined}
      tabIndex={concealed ? -1 : undefined}
      className={`${osDockPillClassName} portfolio-page-chevron${
        covered && !concealed ? ' is-content-covered' : ''
      }`}
      onClick={onOpen}
    >
      <ChevronUpIcon aria-hidden />
    </OsIconAction>
  );
}
