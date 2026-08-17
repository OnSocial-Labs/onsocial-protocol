'use client';

import type { ReactNode, Ref } from 'react';

export type OsChipRailItem<TId extends string | null = string> = {
  id: TId;
  label: ReactNode;
  /** Override React key when `id` may be null. */
  key?: string;
};

type OsChipRailBase = {
  ariaLabel: string;
  className?: string;
  scrollerClassName?: string;
  scrollerRef?: Ref<HTMLDivElement>;
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

/**
 * Horizontal discovery chip rail — shared chrome for Discover / Drops /
 * Market / Collectibles / Guilds filter tabs.
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
              <button
                key={key}
                type="button"
                aria-pressed={selected}
                className={selected ? 'is-active' : undefined}
                onClick={() => multi.onToggle(id)}
              >
                {item.label}
              </button>
            );
          }

          if (selection === 'option') {
            const option = props as OsChipRailOptionProps<TId>;
            const selected = option.value === item.id;
            return (
              <button
                key={key}
                type="button"
                role="option"
                aria-selected={selected}
                className={selected ? 'is-active' : undefined}
                onClick={() => option.onValueChange(item.id)}
              >
                {item.label}
              </button>
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
            <button
              key={key}
              type="button"
              role="tab"
              id={tabId}
              aria-controls={controls}
              aria-selected={selected}
              className={selected ? 'is-active' : undefined}
              onClick={() => single.onValueChange(item.id)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
