'use client';

import type { CSSProperties, ReactNode, Ref } from 'react';
import { cn } from './cn.js';
import {
  GlassSheet,
  type GlassSheetPresentation,
  type GlassSheetSurface,
} from './glass-sheet.js';
import { useScrollLock } from './use-scroll-lock.js';

/** Full-bleed phone-page panel (hosted clips to OS card radius). */
export const osPageSheetPanelClassName = 'os-page-sheet-panel';

export type OsPageSheetSurface = GlassSheetSurface;

export interface OsPageSheetProps {
  open: boolean;
  onClose: () => void;
  onClosed?: () => void;
  /**
   * `glass` — frosted standing / Discover cover.
   * `page` — opaque canvas (`--bg`, or an opaque mood mix when `moodId` is
   * set). No frost. Never a transparent fill.
   */
  surface?: OsPageSheetSurface;
  /**
   * Default `appear` — fade in place like compose, even over another sheet.
   * `swap` holds a page already covering the column (portfolio route changes).
   * Do not drop `appear` or an editor over Account / Settings slides as a push.
   */
  presentation?: GlassSheetPresentation;
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  bodyRef?: Ref<HTMLDivElement | null>;
  bodyClassName?: string;
  panelClassName?: string;
  panelStyle?: CSSProperties;
  ariaLabelledBy: string;
  backdropLabel?: string;
  zIndex?: number;
  /** Sets `data-mood` when `surface="page"` (pair with `moodStyle`). */
  moodId?: string;
  /** Mood CSS vars — same role as OsSlideOverScreen `moodStyle`. */
  moodStyle?: CSSProperties;
  dragDismiss?: boolean;
  portalContainer?: HTMLElement | null;
  /** Extra class on the portaled root (park a sheet without unmounting it). */
  rootClassName?: string;
  /**
   * Keep the portfolio summon dock visible (Propose / compose). Default false —
   * overlays tuck the dock.
   */
  keepDock?: boolean;
  /** When false, the page under the sheet can still scroll. Default true. */
  lockScroll?: boolean;
  /**
   * Hold the appear until the first real frame is painted (seeded post page).
   * The page cover stays up; the fade starts on the finished content.
   */
  deferEnter?: boolean;
}

/**
 * Full OS-column page shell — portfolio signal covers (`glass`) and
 * compose / slide-page flows (`page`). Hosted portal clip via GlassSheet.
 */
export function OsPageSheet({
  open,
  onClose,
  onClosed,
  surface = 'glass',
  presentation = 'appear',
  header,
  footer,
  children,
  bodyRef,
  bodyClassName,
  panelClassName,
  panelStyle,
  ariaLabelledBy,
  backdropLabel = 'Close panel',
  zIndex = 50,
  moodId,
  moodStyle,
  dragDismiss = false,
  portalContainer,
  rootClassName,
  keepDock = false,
  lockScroll = true,
  deferEnter = false,
}: OsPageSheetProps) {
  useScrollLock(open && lockScroll);

  const mergedPanelStyle =
    moodStyle || panelStyle
      ? ({ ...moodStyle, ...panelStyle } as CSSProperties)
      : undefined;

  return (
    <GlassSheet
      open={open}
      onClose={onClose}
      onClosed={onClosed}
      tone="os"
      surface={surface}
      sheetSurface="page"
      presentation={presentation}
      initialDetent="full"
      dragDismiss={dragDismiss}
      sizing="full"
      zIndex={zIndex}
      ariaLabelledBy={ariaLabelledBy}
      backdropLabel={backdropLabel}
      bodyRef={bodyRef}
      bodyClassName={bodyClassName}
      panelClassName={cn(osPageSheetPanelClassName, panelClassName)}
      rootClassName={rootClassName}
      keepDock={keepDock}
      deferEnter={deferEnter}
      {...(mergedPanelStyle ? { panelStyle: mergedPanelStyle } : {})}
      {...(moodStyle ? { moodStyle } : {})}
      {...(moodId ? { moodId } : {})}
      {...(portalContainer !== undefined ? { portalContainer } : {})}
      header={header}
      footer={footer}
    >
      {children}
    </GlassSheet>
  );
}
