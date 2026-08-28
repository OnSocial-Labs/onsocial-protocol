'use client';

import type { ReactNode, Ref } from 'react';
import { MultiplyIcon } from '@onsocial/ui';

export type OsChipRailItem<TId extends string | null = string> = {
  id: TId;
  label: ReactNode;
  /** Override React key when `id` may be null. */
  key?: string;
  /**
   * When set, the selected chip becomes a cluster with ×.
   * Used for removable saved / ephemeral Home chips.
   */
  onRemove?: () => void;
  removeAriaLabel?: string;
};

type OsChipRailBase = {
  ariaLabel: string;
  className?: string;
  scrollerClassName?: string;
  scrollerRef?: Ref<HTMLDivElement>;
  /** Attached to the selected chip (or cluster) for scroll-into-view. */
  selectedRef?: Ref<HTMLElement | null>;
  /** After chips inside the scroller — e.g. Home + add-feed. */
  trailing?: ReactNode;
};

export type OsChipRailSingleProps<TId extends string | null = string> =
  OsChipRailBase & {
    selection?: 'single';
    items: ReadonlyArray<OsChipRailItem<TId>>;
    value: TId;
    onValueChange: (id: TId) => void;
    /** Optional `id` on each tab button. */
    tabIdFor?: (id: TId) => string | undefined;
    /** Shared or per-tab `aria-controls`. */
    ariaControls?: string | ((id: TId) => string | undefined);
  };

export type OsChipRailMultiProps<TId extends string = string> = OsChipRailBase & {
  selection: 'multi';
  items: ReadonlyArray<OsChipRailItem<TId>>;
  values: ReadonlyArray<TId>;
  onToggle: (id: TId) => void;
};

export type OsChipRailOptionProps<TId extends string | null = string> =
  OsChipRailBase & {
    selection: 'option';
    items: ReadonlyArray<OsChipRailItem<TId>>;
    value: TId;
    onValueChange: (id: TId) => void;
  };

export type OsChipRailProps<TId extends string | null = string> =
  | OsChipRailSingleProps<TId>
  | OsChipRailMultiProps<Extract<TId, string>>
  | OsChipRailOptionProps<TId>;

function itemKey<TId extends string | null>(
  item: OsChipRailItem<TId>,
  index: number
): string {
  if (item.key != null) return item.key;
  if (item.id == null) return `chip-null-${index}`;
  return String(item.id);
}

function joinClassNames(
  ...parts: Array<string | undefined | false>
): string | undefined {
  const value = parts.filter(Boolean).join(' ');
  return value || undefined;
}

function assignRef<T>(ref: Ref<T> | undefined, value: T) {
  if (!ref) return;
  if (typeof ref === 'function') {
    ref(value);
  } else {
    ref.current = value;
  }
}

/**
 * Horizontal discovery chip rail — shared chrome for Discover / Drops /
 * Market / Collectibles / Guilds / Home filter tabs.
 *
 * Keep app-local (OS chrome). Do not move into `@onsocial/ui`.
 */
export function OsChipRail<TId extends string | null = string>(
  props: OsChipRailProps<TId>
) {
  const {
    ariaLabel,
    className,
    scrollerClassName,
    scrollerRef,
    selectedRef,
    trailing,
    items,
  } = props;
  const selection = props.selection ?? 'single';

  const rootRole =
    selection === 'multi'
      ? 'group'
      : selection === 'option'
        ? 'listbox'
        : 'tablist';

  return (
    <div
      className={joinClassNames('discover-tab-bar', className)}
      role={rootRole}
      aria-label={ariaLabel}
    >
      <div
        className={joinClassNames('discover-tab-bar-scroller', scrollerClassName)}
        ref={scrollerRef}
      >
        {items.map((item, index) => {
          const key = itemKey(item, index);

          if (selection === 'multi') {
            const multi = props as OsChipRailMultiProps<Extract<TId, string>>;
            const id = item.id as Extract<TId, string>;
            const selected = multi.values.includes(id);
            return (
              <ChipNode
                key={key}
                item={item}
                selected={selected}
                selectedRef={selectedRef}
                role="button"
                pressed={selected}
                onSelect={() => multi.onToggle(id)}
              />
            );
          }

          if (selection === 'option') {
            const option = props as OsChipRailOptionProps<TId>;
            const selected = option.value === item.id;
            return (
              <ChipNode
                key={key}
                item={item}
                selected={selected}
                selectedRef={selectedRef}
                role="option"
                onSelect={() => option.onValueChange(item.id)}
              />
            );
          }

          const single = props as OsChipRailSingleProps<TId>;
          const selected = single.value === item.id;
          const tabId = single.tabIdFor?.(item.id);
          const controls =
            typeof single.ariaControls === 'function'
              ? single.ariaControls(item.id)
              : single.ariaControls;

          return (
            <ChipNode
              key={key}
              item={item}
              selected={selected}
              selectedRef={selectedRef}
              role="tab"
              tabId={tabId}
              ariaControls={controls}
              onSelect={() => single.onValueChange(item.id)}
            />
          );
        })}
        {trailing}
      </div>
    </div>
  );
}

function ChipNode<TId extends string | null>({
  item,
  selected,
  selectedRef,
  role,
  tabId,
  ariaControls,
  pressed,
  onSelect,
}: {
  item: OsChipRailItem<TId>;
  selected: boolean;
  selectedRef?: Ref<HTMLElement | null>;
  role: 'tab' | 'option' | 'button';
  tabId?: string;
  ariaControls?: string;
  pressed?: boolean;
  onSelect: () => void;
}) {
  const showRemove = Boolean(item.onRemove && selected);
  const button = (
    <button
      type="button"
      role={role === 'button' ? undefined : role}
      id={tabId}
      aria-controls={ariaControls}
      aria-selected={role === 'button' ? undefined : selected}
      aria-pressed={role === 'button' ? pressed : undefined}
      className={selected ? 'is-active' : undefined}
      ref={
        selected && !showRemove
          ? (node) => assignRef(selectedRef, node)
          : undefined
      }
      onClick={onSelect}
    >
      {item.label}
    </button>
  );

  if (!showRemove) return button;

  return (
    <span
      ref={(node) => assignRef(selectedRef, node)}
      className="discover-tab-bar-chip-cluster is-active"
    >
      {button}
      <button
        type="button"
        className="discover-tab-bar-chip-remove"
        aria-label={item.removeAriaLabel ?? 'Remove'}
        onClick={(event) => {
          event.stopPropagation();
          item.onRemove?.();
        }}
      >
        <MultiplyIcon
          aria-hidden
          className="discover-tab-bar-chip-remove-icon"
        />
      </button>
    </span>
  );
}
