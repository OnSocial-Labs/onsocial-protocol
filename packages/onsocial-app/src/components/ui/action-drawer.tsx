'use client';

import { useCallback, useId, useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import { Divider, GlassSheet, SheetHeader } from '@onsocial/ui';
import { useScrollLock } from '@/hooks/use-scroll-lock';

export interface ActionDrawerItem {
  id: string;
  label: string;
  /** Quiet secondary line under the label. */
  description?: string;
  /** Leading visual — prefer a Mage icon sized via `action-drawer-icon`. */
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

interface ActionDrawerProps {
  open: boolean;
  onClose: () => void;
  onClosed?: () => void;
  /** Sheet title + aria label. */
  label: string;
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
  hint?: string;
  /** Called when the header close control is used. */
  closeAriaLabel?: string;
  zIndex?: number;
}

/**
 * Content-hugging action-list sheet — the action twin of `ChoiceDrawer`.
 * Same open/spacing/material as the scarce list choice drawers and the guild
 * manage menu, so overflow menus (post options, member management) navigate
 * like every other drawer instead of an anchored dropdown.
 */
export function ActionDrawer({
  open,
  onClose,
  onClosed,
  label,
  copy,
  listAriaLabel,
  items,
  children,
  hint,
  closeAriaLabel,
  zIndex = 60,
}: ActionDrawerProps) {
  const titleId = useId();
  const sections = useMemo(() => groupItems(items ?? []), [items]);
  const closeLabel = closeAriaLabel ?? `Close ${label.toLowerCase()}`;

  useScrollLock(open);

  const renderItem = useCallback((item: ActionDrawerItem) => {
    const className = `scarce-choice-sheet-option${
      item.destructive ? ' is-destructive' : ''
    }`;
    const body = (
      <>
        {item.leading ? (
          <span className="scarce-choice-sheet-leading">{item.leading}</span>
        ) : null}
        <span className="scarce-choice-sheet-option-copy">
          <span className="scarce-choice-sheet-option-primary">
            <span className="scarce-choice-sheet-option-label">
              {item.label}
            </span>
            {item.trailing ? (
              <span className="scarce-choice-sheet-trailing">
                {item.trailing}
              </span>
            ) : null}
          </span>
          {item.description ? (
            <span className="scarce-choice-sheet-option-desc">
              {item.description}
            </span>
          ) : null}
        </span>
      </>
    );

    if (item.href && !item.disabled) {
      return (
        <Link
          key={item.id}
          href={item.href}
          scroll={false}
          role="menuitem"
          className={className}
          onClick={() => item.onSelect?.()}
        >
          {body}
        </Link>
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
  }, []);

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
      panelClassName="scarce-choice-sheet-panel"
      bodyClassName="scarce-choice-sheet-body"
      header={
        <>
          <SheetHeader
            titleId={titleId}
            title={label}
            {...(copy ? { subtitle: copy } : {})}
            onClose={onClose}
            closeAriaLabel={closeLabel}
          />
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
    >
      {children ? (
        children
      ) : (
        <div
          className="scarce-choice-sheet-list"
          role="menu"
          aria-label={listAriaLabel ?? label}
        >
          {sections.map((section, sectionIndex) => (
            <div
              key={section.title ?? `section-${sectionIndex}`}
              className="scarce-choice-sheet-section"
            >
              {section.title ? (
                <p className="scarce-choice-sheet-section-title">
                  {section.title}
                </p>
              ) : null}
              {section.items.map((item) => renderItem(item))}
            </div>
          ))}
        </div>
      )}
      {hint ? <p className="scarce-choice-sheet-hint">{hint}</p> : null}
    </GlassSheet>
  );
}
