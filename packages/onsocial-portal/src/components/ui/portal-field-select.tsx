'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { FloatingPanelMenu } from '@/components/ui/floating-panel-menu';
import {
  floatingPanelItemActiveClass,
  floatingPanelItemClass,
  floatingPanelItemSelectedClass,
} from '@/components/ui/floating-panel';
import { useDropdown } from '@/hooks/use-dropdown';
import { cn } from '@/lib/utils';

export interface PortalFieldSelectOption {
  value: string;
  label: string;
  hint?: string;
}

const fieldLabelClass =
  'mb-2 block portal-type-label font-medium uppercase tracking-[0.16em] text-muted-foreground';

export function PortalFieldSelect({
  label,
  value,
  options,
  onChange,
  disabled = false,
  placeholder = 'Select',
  ariaLabel,
  className,
  triggerClassName,
  compact = false,
}: {
  label?: string;
  value: string;
  options: PortalFieldSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  triggerClassName?: string;
  compact?: boolean;
}) {
  const fallbackId = useId();
  const triggerId = `portal-field-select-${fallbackId}`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const { isOpen, open, close, toggle, containerRef } = useDropdown();

  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value)
  );
  const [activeIndex, setActiveIndex] = useState(selectedIndex);

  useEffect(() => {
    setActiveIndex(selectedIndex);
  }, [selectedIndex, value]);

  const selectedOption =
    options.find((option) => option.value === value) ?? null;

  const selectAtIndex = useCallback(
    (index: number) => {
      const option = options[index];
      if (!option) return;
      onChange(option.value);
      close();
      triggerRef.current?.focus();
    },
    [close, onChange, options]
  );

  const openMenu = useCallback(
    (index: number) => {
      if (disabled || options.length === 0) return;
      setActiveIndex(index);
      open();
      requestAnimationFrame(() => {
        optionRefs.current[index]?.focus();
      });
    },
    [disabled, open, options.length]
  );

  const showMenu = options.length > 1;

  return (
    <div className={className}>
      {label ? (
        <label htmlFor={triggerId} className={fieldLabelClass}>
          {label}
        </label>
      ) : null}

      <div className="relative" ref={containerRef}>
        <button
          ref={triggerRef}
          id={triggerId}
          type="button"
          disabled={disabled || options.length === 0}
          onClick={() => {
            if (!showMenu) return;
            toggle();
          }}
          onKeyDown={(event) => {
            if (!showMenu) return;
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              openMenu(Math.min(selectedIndex + 1, options.length - 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              openMenu(Math.max(selectedIndex - 1, 0));
            } else if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              if (isOpen) {
                selectAtIndex(activeIndex);
              } else {
                openMenu(selectedIndex);
              }
            }
          }}
          aria-haspopup={showMenu ? 'listbox' : undefined}
          aria-expanded={showMenu ? isOpen : undefined}
          aria-label={ariaLabel ?? label}
          className={cn(
            'portal-field-focus flex w-full items-center justify-between rounded-2xl border text-left text-sm outline-none transition-colors',
            compact ? 'px-3 py-2.5' : 'px-4 py-3 md:py-3.5',
            isOpen
              ? 'border-border bg-background/60'
              : 'border-border/40 bg-background/45',
            (disabled || options.length === 0) && 'cursor-default opacity-60',
            triggerClassName
          )}
        >
          <span className="min-w-0 truncate font-medium">
            {selectedOption?.label ?? placeholder}
          </span>
          {showMenu ? (
            <ChevronDown
              className={cn(
                'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                isOpen && 'rotate-180'
              )}
            />
          ) : null}
        </button>

        {showMenu ? (
          <FloatingPanelMenu
            open={isOpen}
            align="full"
            className="space-y-0.5 p-1 md:p-1.5"
            role="listbox"
            aria-label={ariaLabel ?? label ?? 'Select option'}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActiveIndex((current) =>
                  Math.min(current + 1, options.length - 1)
                );
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveIndex((current) => Math.max(current - 1, 0));
              } else if (event.key === 'Home') {
                event.preventDefault();
                setActiveIndex(0);
              } else if (event.key === 'End') {
                event.preventDefault();
                setActiveIndex(options.length - 1);
              } else if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                selectAtIndex(activeIndex);
              } else if (event.key === 'Escape') {
                event.preventDefault();
                close();
                triggerRef.current?.focus();
              } else if (event.key === 'Tab') {
                close();
              }
            }}
          >
            {options.map((option, index) => {
              const selected = option.value === value;
              const active = index === activeIndex;

              return (
                <button
                  ref={(element) => {
                    optionRefs.current[index] = element;
                  }}
                  key={option.value}
                  id={`${triggerId}-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  tabIndex={active ? 0 : -1}
                  onClick={() => selectAtIndex(index)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={cn(
                    floatingPanelItemClass,
                    'justify-between',
                    selected
                      ? floatingPanelItemSelectedClass
                      : active
                        ? floatingPanelItemActiveClass
                        : ''
                  )}
                >
                  <span className="min-w-0 text-left">
                    <span className="block truncate">{option.label}</span>
                    {option.hint ? (
                      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground/80">
                        {option.hint}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                    {selected ? <Check className="h-4 w-4" /> : null}
                  </span>
                </button>
              );
            })}
          </FloatingPanelMenu>
        ) : null}
      </div>
    </div>
  );
}
