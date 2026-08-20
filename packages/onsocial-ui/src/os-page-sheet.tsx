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
   * `page` — flat slide-over fill (`--mood-bg` / `--bg`), no frost.
   */
  surface?: OsPageSheetSurface;
  presentation?: GlassSheetPresentation;
  header?: ReactNode;
  footer?: ReactNode;
  footerOverlay?: boolean;
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
  /**
   * Keep the portfolio summon dock visible (Propose / compose). Default false —
   * overlays tuck the dock.
   */
  keepDock?: boolean;
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
  footerOverlay = false,
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
  keepDock = false,
}: OsPageSheetProps) {
  useScrollLock(open);

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
      keepDock={keepDock}
      {...(mergedPanelStyle ? { panelStyle: mergedPanelStyle } : {})}
      {...(moodId ? { moodId } : {})}
      {...(portalContainer !== undefined ? { portalContainer } : {})}
      header={header}
      footer={footer}
      footerOverlay={footerOverlay}
    >
      {children}
    </GlassSheet>
  );
}
