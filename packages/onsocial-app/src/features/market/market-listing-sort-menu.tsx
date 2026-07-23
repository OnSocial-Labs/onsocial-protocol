'use client';

import { useEffect } from 'react';
import {
  ChevronDownIcon,
  FloatingPanelMenu,
  osFloatingPanelBodyClassName,
  osFloatingPanelHeaderActiveClassName,
  osFloatingPanelHeaderClassName,
  osFloatingPanelHeaderLabelClassName,
  osFloatingPanelItemClassName,
  osFloatingPanelTriggerChevronClassName,
  osFloatingPanelTriggerClassName,
  osFloatingPanelTriggerLabelClassName,
  osFloatingPanelTriggerMetaClassName,
  useDropdown,
} from '@onsocial/ui';
import type { MarketListingSort } from '@/features/market/market-listings';

const SORT_OPTIONS: { id: MarketListingSort; label: string }[] = [
  { id: 'newest', label: 'Newest' },
  { id: 'price-asc', label: 'Price ↑' },
  { id: 'price-desc', label: 'Price ↓' },
  { id: 'ending', label: 'Ending' },
];

export function MarketListingSortMenu({
  sort,
  onSortChange,
  endingDisabled = false,
  onOpenChange,
}: {
  sort: MarketListingSort;
  onSortChange: (sort: MarketListingSort) => void;
  endingDisabled?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { isOpen, close, toggle, containerRef, panelRef } = useDropdown();
  const activeLabel =
    SORT_OPTIONS.find((option) => option.id === sort)?.label ?? 'Newest';
  const menuLabel = 'Sort';

  useEffect(() => {
    onOpenChange?.(isOpen);
    return () => onOpenChange?.(false);
  }, [isOpen, onOpenChange]);

  return (
    <div
      className="standing-view-menu market-listing-sort-menu"
      ref={containerRef}
    >
      <button
        type="button"
        className={`${osFloatingPanelTriggerClassName}${isOpen ? ' is-open' : ''}`}
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={
          isOpen
            ? `Close ${menuLabel.toLowerCase()} menu`
            : `Open ${menuLabel.toLowerCase()} menu`
        }
      >
        <span className={osFloatingPanelTriggerLabelClassName}>
          {activeLabel}
        </span>
        <span className={osFloatingPanelTriggerMetaClassName}>
          <ChevronDownIcon
            className={`${osFloatingPanelTriggerChevronClassName}${
              isOpen ? ' is-open' : ''
            }`}
            aria-hidden
          />
        </span>
      </button>

      <FloatingPanelMenu
        ref={panelRef}
        open={isOpen}
        align="right"
        offset="sm"
        className="standing-view-menu-panel market-listing-sort-menu-panel"
        role="listbox"
        aria-label={menuLabel}
      >
        <div className={osFloatingPanelHeaderClassName}>
          <p className={osFloatingPanelHeaderLabelClassName}>{menuLabel}</p>
          <p className={osFloatingPanelHeaderActiveClassName}>{activeLabel}</p>
        </div>

        <div className={osFloatingPanelBodyClassName}>
          {SORT_OPTIONS.map((option) => {
            const selected = option.id === sort;
            const disabled = option.id === 'ending' && endingDisabled;
            return (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={disabled}
                className={`${osFloatingPanelItemClassName}${
                  selected ? ' is-selected' : ''
                }`}
                onClick={() => {
                  if (disabled) return;
                  onSortChange(option.id);
                  close();
                }}
              >
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      </FloatingPanelMenu>
    </div>
  );
}
