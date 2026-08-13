'use client';

import { useId, type CSSProperties, type ReactNode } from 'react';
import { Divider } from './divider.js';
import {
  GlassSheet,
  SheetHeader,
  type GlassSheetDetent,
  type GlassSheetPresentation,
  type GlassSheetSizing,
} from './glass-sheet.js';
import {
  osChoiceSheetBodyClassName,
  osChoiceSheetPanelClassName,
} from './os-choice-tokens.js';
import { useScrollLock } from './use-scroll-lock.js';
import { cn } from './cn.js';

export type OsHugSheetChrome = 'choice' | 'plain';

export interface OsHugSheetProps {
  open: boolean;
  onClose: () => void;
  onClosed?: () => void;
  /** Default title + aria / backdrop wording. */
  label: string;
  /** Optional rich title. Defaults to `label`. */
  title?: ReactNode;
  /** Sibling of the title outside the heading (e.g. Clear). */
  titleAccessory?: ReactNode;
  /** Quiet line under the title. */
  copy?: string;
  children: ReactNode;
  footer?: ReactNode;
  closeAriaLabel?: string;
  /** When false, hides the header close control (e.g. mid-wallet). */
  showClose?: boolean;
  zIndex?: number;
  /**
   * `choice` — pick/action drawer panel + body tokens.
   * `plain` — host supplies panel/body classes (facts, protocol, forms).
   */
  chrome?: OsHugSheetChrome;
  panelClassName?: string;
  bodyClassName?: string;
  headerClassName?: string;
  panelStyle?: CSSProperties;
  backdropLabel?: string;
  /** Defaults to `hug`. */
  sizing?: GlassSheetSizing;
  /** Defaults to `full` (natural height rest for hug sheets). */
  initialDetent?: GlassSheetDetent;
  /** Defaults to `1` when hug + full detent. */
  peekRatio?: number;
  presentation?: GlassSheetPresentation;
  /** Optional fixed title id when the host also references it. */
  titleId?: string;
}

/**
 * Shared content-hugging OS sheet shell — header + divider + GlassSheet hug.
 * Choice / Action / Info drawers use `chrome="choice"`; facts & protocol use plain.
 * Pair with `os-choice-drawer.css` when `chrome="choice"`.
 */
export function OsHugSheet({
  open,
  onClose,
  onClosed,
  label,
  title,
  titleAccessory,
  copy,
  children,
  footer,
  closeAriaLabel,
  showClose = true,
  zIndex = 60,
  chrome = 'plain',
  panelClassName,
  bodyClassName,
  headerClassName,
  panelStyle,
  backdropLabel,
  sizing = 'hug',
  initialDetent = 'full',
  peekRatio = 1,
  presentation,
  titleId: titleIdProp,
}: OsHugSheetProps) {
  const generatedTitleId = useId();
  const titleId = titleIdProp ?? generatedTitleId;
  const closeLabel = closeAriaLabel ?? `Close ${label.toLowerCase()}`;

  useScrollLock(open);

  return (
    <GlassSheet
      open={open}
      onClose={onClose}
      onClosed={onClosed}
      tone="os"
      initialDetent={initialDetent}
      peekRatio={peekRatio}
      zIndex={zIndex}
      ariaLabelledBy={titleId}
      backdropLabel={backdropLabel ?? closeLabel}
      sizing={sizing}
      {...(presentation ? { presentation } : {})}
      panelClassName={cn(
        chrome === 'choice' && osChoiceSheetPanelClassName,
        panelClassName
      )}
      bodyClassName={cn(
        chrome === 'choice' && osChoiceSheetBodyClassName,
        bodyClassName
      )}
      {...(panelStyle ? { panelStyle } : {})}
      header={
        <>
          <SheetHeader
            titleId={titleId}
            title={title ?? label}
            className={headerClassName}
            {...(titleAccessory ? { titleAccessory } : {})}
            {...(copy ? { subtitle: copy } : {})}
            {...(showClose ? { onClose, closeAriaLabel: closeLabel } : {})}
          />
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
      footer={footer}
    >
      {children}
    </GlassSheet>
  );
}
