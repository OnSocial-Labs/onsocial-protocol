'use client';

import { useId, type CSSProperties, type ReactNode } from 'react';
import {
  GlassSheet,
  type GlassSheetDetent,
  type GlassSheetPresentation,
  type GlassSheetSizing,
} from './glass-sheet.js';
import {
  GestureSheetHeader,
  type GestureSheetSignal,
} from './gesture-sheet-header.js';
import { useScrollLock } from './use-scroll-lock.js';
import { osHugSheetBodyClassName } from './os-choice-tokens.js';
import { cn } from './cn.js';

/** Shared gesture panel chrome (signal fallbacks + body opacity). */
export const osGestureSheetPanelClassName = 'os-gesture-sheet-panel';

/** Tall commerce / Support / Protocol cap — alias of former profile-support panel. */
export const osGestureSheetPanelTallClassName = 'os-gesture-sheet-panel--tall';

/**
 * Scarce Buy / Sell / Bid / Offer / List marker — verbs + amount chips
 * follow `--signal-reputation` (mood-blended). Love / player stay
 * protocol green in clip CSS. Do not re-lock this class to `--protocol-green`.
 */
export const osGestureSheetPanelCommerceClassName =
  'os-gesture-sheet-panel--commerce';

export const osGestureSheetBodyClassName = 'os-gesture-sheet-body';

export type OsGestureSheetSize = 'tall' | 'compact';

export interface OsGestureSheetProps {
  open: boolean;
  onClose: () => void;
  onClosed?: () => void;
  verb: string;
  personName?: string;
  handle?: string;
  signal: GestureSheetSignal;
  whisper?: ReactNode;
  closeAriaLabel: string;
  backdropLabel?: string;
  children: ReactNode;
  footer?: ReactNode;
  moodId?: string;
  panelStyle?: CSSProperties;
  /** Extra panel classes (after shared gesture chrome). */
  panelClassName?: string;
  bodyClassName?: string;
  zIndex?: number;
  /** Adds `is-keyboard-open` for pinned-footer commerce sheets. */
  keyboardOpen?: boolean;
  /**
   * `tall` — Support / scarce / protocol max-height.
   * `compact` — short forms (Endorse compose).
   */
  size?: OsGestureSheetSize;
  sizing?: GlassSheetSizing;
  initialDetent?: GlassSheetDetent;
  peekRatio?: number;
  presentation?: GlassSheetPresentation;
  titleId?: string;
}

/**
 * Face / commerce gesture sheet — GlassSheet hug + GestureSheetHeader.
 * Pair with `os-gesture-sheet-header.css` (panel + header + body inset). Host
 * owns mood resolve and form bodies. Prefer `bodyClassName="profile-support-sheet-body"`
 * in app hosts for shared keyboard/footer overrides; inset comes from
 * `.os-gesture-sheet-body`.
 */
export function OsGestureSheet({
  open,
  onClose,
  onClosed,
  verb,
  personName,
  handle,
  signal,
  whisper,
  closeAriaLabel,
  backdropLabel,
  children,
  footer,
  moodId,
  panelStyle,
  panelClassName,
  bodyClassName,
  zIndex = 56,
  keyboardOpen = false,
  size = 'tall',
  sizing = 'hug',
  initialDetent = 'full',
  peekRatio = 1,
  presentation,
  titleId: titleIdProp,
}: OsGestureSheetProps) {
  const generatedTitleId = useId();
  const titleId = titleIdProp ?? generatedTitleId;

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
      backdropLabel={backdropLabel ?? closeAriaLabel}
      sizing={sizing}
      {...(moodId ? { moodId } : {})}
      {...(presentation ? { presentation } : {})}
      {...(panelStyle ? { panelStyle } : {})}
      {...(footer !== undefined ? { footer } : {})}
      panelClassName={cn(
        osGestureSheetPanelClassName,
        size === 'tall' && osGestureSheetPanelTallClassName,
        keyboardOpen && 'is-keyboard-open',
        panelClassName
      )}
      bodyClassName={cn(
        osHugSheetBodyClassName,
        osGestureSheetBodyClassName,
        bodyClassName
      )}
      header={
        <>
          <GestureSheetHeader
            titleId={titleId}
            verb={verb}
            {...(personName != null ? { personName } : {})}
            {...(handle != null ? { handle } : {})}
            signal={signal}
            closeAriaLabel={closeAriaLabel}
            onClose={onClose}
            {...(whisper != null ? { whisper } : {})}
          />
        </>
      }
    >
      {children}
    </GlassSheet>
  );
}
