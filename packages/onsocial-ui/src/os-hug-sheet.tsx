'use client';

import { useId, type CSSProperties, type ReactNode } from 'react';
import { Divider } from './divider.js';
import { GlassSheet, SheetHeader } from './glass-sheet.js';
import {
  osChoiceSheetBodyClassName,
  osChoiceSheetPanelClassName,
} from './os-choice-tokens.js';
import { useScrollLock } from './use-scroll-lock.js';

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
  panelClassName?: string;
  bodyClassName?: string;
  panelStyle?: CSSProperties;
  backdropLabel?: string;
}

/**
 * Shared content-hugging OS sheet shell — panel/body/header chrome used by
 * ChoiceDrawer, ActionDrawer, InfoDrawer, and custom hug bodies.
 * Pair with `os-choice-drawer.css`.
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
  panelClassName,
  bodyClassName,
  panelStyle,
  backdropLabel,
}: OsHugSheetProps) {
  const titleId = useId();
  const closeLabel = closeAriaLabel ?? `Close ${label.toLowerCase()}`;

  useScrollLock(open);

  return (
    <GlassSheet
      open={open}
      onClose={onClose}
      onClosed={onClosed}
      tone="os"
      initialDetent="full"
      peekRatio={1}
      zIndex={zIndex}
      ariaLabelledBy={titleId}
      backdropLabel={backdropLabel ?? closeLabel}
      sizing="hug"
      panelClassName={[osChoiceSheetPanelClassName, panelClassName]
        .filter(Boolean)
        .join(' ')}
      bodyClassName={[osChoiceSheetBodyClassName, bodyClassName]
        .filter(Boolean)
        .join(' ')}
      {...(panelStyle ? { panelStyle } : {})}
      header={
        <>
          <SheetHeader
            titleId={titleId}
            title={title ?? label}
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
