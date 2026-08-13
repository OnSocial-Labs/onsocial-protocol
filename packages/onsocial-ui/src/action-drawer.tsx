'use client';

import {
  useCallback,
  useId,
  useMemo,
  type ComponentType,
  type ReactNode,
} from 'react';
import { Divider } from './divider.js';
import { GlassSheet, SheetHeader } from './glass-sheet.js';
import {
  osChoiceSheetBodyClassName,
  osChoiceSheetPanelClassName,
} from './choice-drawer.js';
import { useScrollLock } from './use-scroll-lock.js';

export const osActionDrawerIconClassName = 'os-action-drawer-icon';
export const osActionDrawerConfirmClassName = 'os-action-drawer-confirm';
export const osActionDrawerConfirmBodyClassName =
  'os-action-drawer-confirm-body';
export const osActionDrawerConfirmCancelClassName =
  'os-action-drawer-confirm-cancel';

export interface ActionDrawerItem {
  id: string;
  label: string;
  /** Quiet secondary line under the label. */
  description?: string;
  /** Leading visual — prefer a Mage icon sized via `os-action-drawer-icon`. */
  leading?: ReactNode;
  /** Quiet meta after the label (e.g. count / status). */
  trailing?: ReactNode;
  /** Consecutive items with the same section share one header. */
  section?: string;
  disabled?: boolean;
  /** Red destructive styling (remove, cancel, leave). */
  destructive?: boolean;
  /** Render as a client-side nav link instead of a button. */
  href?: string;
  /** Runs on tap for button items. */
  onSelect?: () => void;
}

export interface ActionDrawerLinkProps {
  href: string;
  className?: string;
  role?: string;
  onClick?: () => void;
  children: ReactNode;
}

function groupItems(
  items: readonly ActionDrawerItem[]
): { title: string | null; items: ActionDrawerItem[] }[] {
  const groups: { title: string | null; items: ActionDrawerItem[] }[] = [];
  for (const item of items) {
    const title = item.section?.trim() || null;
    const last = groups[groups.length - 1];
    if (last && last.title === title) {
      last.items.push(item);
    } else {
      groups.push({ title, items: [item] });
    }
  }
  return groups;
}

function DefaultActionDrawerLink({
  href,
  className,
  role,
  onClick,
  children,
}: ActionDrawerLinkProps) {
  return (
    <a href={href} className={className} role={role} onClick={onClick}>
      {children}
    </a>
  );
}

export interface ActionDrawerProps {
  open: boolean;
  onClose: () => void;
  onClosed?: () => void;
  /** Sheet title + default aria label. */
  label: string;
  /** Optional rich title (e.g. custom heading). Defaults to `label`. */
  title?: ReactNode;
  /** Sibling of the title outside the heading (e.g. Clear). */
  titleAccessory?: ReactNode;
  /** Quiet line under the title. */
  copy?: string;
  /** aria-label for the inner list (defaults to `label`). */
  listAriaLabel?: string;
  /** Action list. Omitted when `children` drives a confirm/alternate body. */
  items?: readonly ActionDrawerItem[];
  /**
   * Replaces the item list (e.g. a two-step confirm body). The shared header
   * still renders, so drive `label`/`copy` from the confirm copy.
   */
  children?: ReactNode;
  /** Optional pinned footer (e.g. Done). */
  footer?: ReactNode;
  hint?: string;
  /** Called when the header close control is used. */
  closeAriaLabel?: string;
  zIndex?: number;
  /** Extra panel class (e.g. market filter width tweaks). */
  panelClassName?: string;
  /** Extra body class. */
  bodyClassName?: string;
  /**
   * Link renderer for `href` items. Apps with a client router should pass
   * their Link (e.g. Next.js). Defaults to a plain `<a>`.
   */
  linkComponent?: ComponentType<ActionDrawerLinkProps>;
}

/**
 * Content-hugging action-list sheet — the action twin of `ChoiceDrawer`.
 * Pair with `os-choice-drawer.css`.
 */
export function ActionDrawer({
  open,
  onClose,
  onClosed,
  label,
  title,
  titleAccessory,
  copy,
  listAriaLabel,
  items,
  children,
  footer,
  hint,
  closeAriaLabel,
  zIndex = 60,
  panelClassName,
  bodyClassName,
  linkComponent: LinkComponent = DefaultActionDrawerLink,
}: ActionDrawerProps) {
  const titleId = useId();
  const sections = useMemo(() => groupItems(items ?? []), [items]);
  const closeLabel = closeAriaLabel ?? `Close ${label.toLowerCase()}`;

  useScrollLock(open);

  const renderItem = useCallback(
    (item: ActionDrawerItem) => {
      const className = `os-choice-sheet-option${
        item.destructive ? ' is-destructive' : ''
      }`;
      const body = (
        <>
          {item.leading ? (
            <span className="os-choice-sheet-leading">{item.leading}</span>
          ) : null}
          <span className="os-choice-sheet-option-copy">
            <span className="os-choice-sheet-option-primary">
              <span className="os-choice-sheet-option-label">{item.label}</span>
              {item.trailing ? (
                <span className="os-choice-sheet-trailing">
                  {item.trailing}
                </span>
              ) : null}
            </span>
            {item.description ? (
              <span className="os-choice-sheet-option-desc">
                {item.description}
              </span>
            ) : null}
          </span>
        </>
      );

      if (item.href && !item.disabled) {
        return (
          <LinkComponent
            key={item.id}
            href={item.href}
            role="menuitem"
            className={className}
            onClick={() => item.onSelect?.()}
          >
            {body}
          </LinkComponent>
        );
      }

      return (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          className={className}
          onClick={() => {
            if (item.disabled) return;
            item.onSelect?.();
          }}
        >
          {body}
        </button>
      );
    },
    [LinkComponent]
  );

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
      backdropLabel={closeLabel}
      sizing="hug"
      panelClassName={[osChoiceSheetPanelClassName, panelClassName]
        .filter(Boolean)
        .join(' ')}
      bodyClassName={[osChoiceSheetBodyClassName, bodyClassName]
        .filter(Boolean)
        .join(' ')}
      header={
        <>
          <SheetHeader
            titleId={titleId}
            title={title ?? label}
            {...(titleAccessory ? { titleAccessory } : {})}
            {...(copy ? { subtitle: copy } : {})}
            onClose={onClose}
            closeAriaLabel={closeLabel}
          />
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
      footer={footer}
    >
      {children ? (
        children
      ) : (
        <div
          className="os-choice-sheet-list"
          role="menu"
          aria-label={listAriaLabel ?? label}
        >
          {sections.map((section, sectionIndex) => (
            <div
              key={section.title ?? `section-${sectionIndex}`}
              className="os-choice-sheet-section"
            >
              {section.title ? (
                <p className="os-choice-sheet-section-title">{section.title}</p>
              ) : null}
              {section.items.map((item) => renderItem(item))}
            </div>
          ))}
        </div>
      )}
      {hint ? <p className="os-choice-sheet-hint">{hint}</p> : null}
    </GlassSheet>
  );
}
