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
  osHugSheetBodyClassName,
} from './os-choice-tokens.js';
import { useScrollLock } from './use-scroll-lock.js';
import { cn } from './cn.js';

export { osHugSheetBodyClassName } from './os-choice-tokens.js';

export type OsHugSheetChrome = 'choice' | 'plain' | 'facts';

export function resolveHugSheetHeader({
  chrome,
  label,
  title,
  copy,
}: {
  chrome: OsHugSheetChrome;
  label: string;
  title?: ReactNode;
  copy?: string;
}): {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: string;
} {
  if (chrome === 'facts' && (title != null || copy)) {
    return {
      eyebrow: label,
      title: title ?? copy ?? label,
    };
  }
  return {
    title: title ?? label,
    ...(copy ? { subtitle: copy } : {}),
  };
}

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
  /**
   * Replaces the default close control (e.g. Market link + close).
   * When set, `showClose` is ignored — include close in `headerActions`.
   */
  headerActions?: ReactNode;
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
   * `facts` — kind eyebrow + name title (Hub / Guild / Drop / Account).
   * `plain` — host supplies panel/body classes (lists, forms).
   */
  chrome?: OsHugSheetChrome;
  panelClassName?: string;
  bodyClassName?: string;
  headerClassName?: string;
  panelStyle?: CSSProperties;
  backdropLabel?: string;
  /** Forwarded to GlassSheet for portfolio mood tint. */
  moodId?: string;
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
 * Choice / Action / Info drawers use `chrome="choice"`; entity peeks use
 * `chrome="facts"`; lists and forms use plain.
 * Body inset is standard via `.os-hug-sheet-body` (override with bodyClassName
 * when a flush body is required). Pair with `os-choice-drawer.css` when
 * `chrome="choice"`.
 */
export function OsHugSheet({
  open,
  onClose,
  onClosed,
  label,
  title,
  titleAccessory,
  headerActions,
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
  moodId,
  sizing = 'hug',
  initialDetent = 'full',
  peekRatio = 1,
  presentation,
  titleId: titleIdProp,
}: OsHugSheetProps) {
  const generatedTitleId = useId();
  const titleId = titleIdProp ?? generatedTitleId;
  const closeLabel = closeAriaLabel ?? `Close ${label.toLowerCase()}`;
  const heading = resolveHugSheetHeader({ chrome, label, title, copy });

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
      {...(moodId ? { moodId } : {})}
      {...(presentation ? { presentation } : {})}
      panelClassName={cn(
        chrome === 'choice' && osChoiceSheetPanelClassName,
        panelClassName
      )}
      bodyClassName={cn(
        osHugSheetBodyClassName,
        chrome === 'choice' && osChoiceSheetBodyClassName,
        bodyClassName
      )}
      {...(panelStyle ? { panelStyle } : {})}
      header={
        <>
          <SheetHeader
            titleId={titleId}
            title={heading.title}
            className={headerClassName}
            {...(heading.eyebrow ? { eyebrow: heading.eyebrow } : {})}
            {...(titleAccessory ? { titleAccessory } : {})}
            {...(heading.subtitle ? { subtitle: heading.subtitle } : {})}
            {...(headerActions
              ? { actions: headerActions }
              : showClose
                ? { onClose, closeAriaLabel: closeLabel }
                : {})}
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
