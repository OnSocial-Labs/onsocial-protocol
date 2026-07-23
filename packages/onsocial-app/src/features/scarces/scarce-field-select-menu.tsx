'use client';

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

export interface ScarceFieldSelectOption<T extends string> {
  value: T;
  label: string;
}

interface ScarceFieldSelectMenuProps<T extends string> {
  label: string;
  value: T;
  options: readonly ScarceFieldSelectOption<T>[];
  onChange: (next: T) => void;
  disabled?: boolean;
  ariaLabel?: string;
}

export function ScarceFieldSelectMenu<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  ariaLabel,
}: ScarceFieldSelectMenuProps<T>) {
  const { isOpen, close, toggle, containerRef, panelRef } = useDropdown();
  const activeLabel =
    options.find((option) => option.value === value)?.label ?? value;
  const menuLabel = label;

  return (
    <div className="scarce-mood-picker-field">
      <span className="scarce-mood-picker-label">{label}</span>
      <div
        className="scarce-field-select standing-view-menu"
        ref={containerRef}
      >
        <button
          type="button"
          className={`${osFloatingPanelTriggerClassName} scarce-field-select-trigger${
            isOpen ? ' is-open' : ''
          }`}
          onClick={() => {
            if (disabled) return;
            toggle();
          }}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-label={
            ariaLabel ??
            (isOpen
              ? `Close ${menuLabel.toLowerCase()} menu`
              : `Open ${menuLabel.toLowerCase()} menu`)
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
          align="left"
          offset="sm"
          className="standing-view-menu-panel scarce-field-select-menu-panel"
          role="listbox"
          aria-label={menuLabel}
        >
          <div className={osFloatingPanelHeaderClassName}>
            <p className={osFloatingPanelHeaderLabelClassName}>{menuLabel}</p>
            <p className={osFloatingPanelHeaderActiveClassName}>
              {activeLabel}
            </p>
          </div>

          <div className={osFloatingPanelBodyClassName}>
            {options.map((option) => {
              const selected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`${osFloatingPanelItemClassName}${
                    selected ? ' is-selected' : ''
                  }`}
                  onClick={() => {
                    onChange(option.value);
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
    </div>
  );
}
