'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, User, X } from 'lucide-react';
import {
  floatingPanelItemActiveClass,
  floatingPanelItemClass,
  floatingPanelItemSelectedClass,
} from '@/components/ui/floating-panel';
import { FloatingPanelMenu } from '@/components/ui/floating-panel-menu';
import { useDropdown } from '@/hooks/use-dropdown';
import { AnimatePresence, motion } from 'framer-motion';
import { InsetDividerItem } from '@/components/ui/inset-divider-group';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import { useMemberAccountLookup } from '@/hooks/use-member-account-lookup';
import {
  getNearAccountInputError,
  isNearAccountInputReady,
  nearAccountPlaceholder,
  normalizeNearAccountId,
  sanitizeNearAccountInput,
} from '@/lib/portal-near-account';
import { cn } from '@/lib/utils';

const feedbackExit = { opacity: 0, transition: { duration: 0 } };
const feedbackEnter = { opacity: 0, y: -4 };
const feedbackAnimate = { opacity: 1, y: 0 };
const feedbackTransition = { duration: 0.16, ease: 'easeOut' as const };

const fieldShellClass =
  'portal-field-focus rounded-2xl border border-border/40 bg-background/45';

const accountTextClass =
  'min-w-0 flex-1 truncate px-4 py-3 font-mono text-sm font-medium md:py-3.5 md:text-base';

export function NearAccountField({
  id,
  variant = 'editable',
  value = '',
  accountId = '',
  onValueChange,
  className,
  trustedAccount = true,
  requirePortalProfile = false,
  density = 'default',
}: {
  id: string;
  variant?: 'editable' | 'readonly';
  value?: string;
  accountId?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  trustedAccount?: boolean;
  /** When true, ready state requires a resolved portal profile. */
  requirePortalProfile?: boolean;
  density?: 'default' | 'compact';
}) {
  const [showFeedback, setShowFeedback] = useState(false);
  const isEditable = variant === 'editable';
  const resolvedAccountId = isEditable
    ? normalizeNearAccountId(value)
    : accountId;
  const lookup = useMemberAccountLookup(resolvedAccountId, { trustedAccount });
  const inputError = getNearAccountInputError(value);
  const formatReady = isNearAccountInputReady(value);
  const ready = requirePortalProfile ? lookup.exists : formatReady;
  const feedbackVisible = isEditable && showFeedback && value.trim().length > 0;
  const showInvalid = feedbackVisible && !formatReady;
  const compact = density === 'compact';

  return (
    <div className={cn(className)}>
      <div className={cn(fieldShellClass, 'flex min-w-0 items-center')}>
        <InsetDividerItem
          showDivider
          className={cn(
            'flex shrink-0 items-center pl-3 pr-3',
            compact ? 'py-1.5' : 'py-2'
          )}
        >
          <span
            className={cn(
              'flex items-center justify-center overflow-hidden rounded-full border border-border/50 bg-muted/30 text-muted-foreground transition-opacity',
              compact ? 'h-6 w-6' : 'h-7 w-7',
              lookup.checking && 'opacity-60'
            )}
          >
            {lookup.exists && lookup.avatarUrl ? (
              <img
                src={lookup.avatarUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <User
                className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'}
                strokeWidth={2}
              />
            )}
          </span>
        </InsetDividerItem>

        {isEditable ? (
          <input
            id={id}
            value={value}
            onChange={(event) => {
              onValueChange?.(sanitizeNearAccountInput(event.target.value));
              setShowFeedback(false);
            }}
            onBlur={() => setShowFeedback(true)}
            placeholder={nearAccountPlaceholder()}
            aria-invalid={showInvalid || undefined}
            aria-describedby={
              feedbackVisible && inputError
                ? compact
                  ? `${id}-account-error-sr`
                  : `${id}-account-error`
                : undefined
            }
            className={cn(
              accountTextClass,
              compact && 'px-3 py-2 text-sm md:py-2 md:text-sm',
              'bg-transparent outline-none placeholder:font-normal placeholder:text-muted-foreground/50'
            )}
            autoComplete="off"
            spellCheck={false}
          />
        ) : (
          <span id={id} className={accountTextClass}>
            {accountId}
          </span>
        )}

        <span className={cn('shrink-0', compact ? 'pr-2.5' : 'pr-3')}>
          {lookup.checking ? (
            <span className="inline-flex h-5 w-5 items-center justify-center text-muted-foreground">
              <PulsingDots size="sm" />
            </span>
          ) : showInvalid ? (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/10 text-red-500">
              <X className="h-3 w-3" />
            </span>
          ) : ready ? (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-700">
              <Check className="h-3 w-3" />
            </span>
          ) : null}
        </span>
      </div>

      <AnimatePresence initial={false}>
        {feedbackVisible && inputError ? (
          compact ? (
            <p id={`${id}-account-error-sr`} className="sr-only">
              {inputError}
            </p>
          ) : (
            <motion.p
              key={`${id}-account-error`}
              id={`${id}-account-error`}
              initial={feedbackEnter}
              animate={feedbackAnimate}
              exit={feedbackExit}
              transition={feedbackTransition}
              className="mt-2 text-xs text-amber-600"
            >
              {inputError}
            </motion.p>
          )
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function NearAccountAvatar({
  accountId,
  trustedAccount = true,
  size = 'md',
}: {
  accountId: string;
  trustedAccount?: boolean;
  size?: 'sm' | 'md';
}) {
  const lookup = useMemberAccountLookup(accountId, { trustedAccount });
  const isSmall = size === 'sm';

  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/50 bg-muted/30 text-muted-foreground transition-opacity',
        isSmall ? 'h-6 w-6' : 'h-7 w-7',
        lookup.checking && 'opacity-60'
      )}
    >
      {lookup.exists && lookup.avatarUrl ? (
        <img
          src={lookup.avatarUrl}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : (
        <User
          className={cn(isSmall ? 'h-3 w-3' : 'h-3.5 w-3.5')}
          strokeWidth={2}
        />
      )}
    </span>
  );
}

export function NearAccountPicker({
  id,
  value,
  options,
  onValueChange,
  placeholder = 'Select member',
  emptyLabel = 'No members available for this role.',
  className,
}: {
  id: string;
  value: string;
  options: string[];
  onValueChange: (value: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  className?: string;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const { isOpen, open, close, toggle, containerRef } = useDropdown();

  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option === value)
  );
  const showDropdown = options.length > 1;

  const closeDropdown = () => {
    close();
    triggerRef.current?.focus();
  };

  const selectAtIndex = (index: number) => {
    const nextValue = options[index];
    if (!nextValue) {
      return;
    }

    onValueChange(nextValue);
    setActiveIndex(index);
    closeDropdown();
  };

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    optionRefs.current[activeIndex]?.focus();
  }, [activeIndex, isOpen]);

  if (options.length === 0) {
    return (
      <div
        className={cn(
          fieldShellClass,
          'px-4 py-3 text-sm text-muted-foreground md:py-3.5',
          className
        )}
      >
        {emptyLabel}
      </div>
    );
  }

  if (!showDropdown) {
    return (
      <NearAccountField
        id={id}
        variant="readonly"
        accountId={options[0]}
        className={className}
      />
    );
  }

  const openDropdown = (index = selectedIndex) => {
    setActiveIndex(index >= 0 ? index : 0);
    open();
  };

  const displayAccountId = value.trim()
    ? value
    : (options[selectedIndex] ?? '');

  return (
    <div className={cn('relative', className)} ref={containerRef}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        onClick={toggle}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            openDropdown(Math.min(selectedIndex + 1, options.length - 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            openDropdown(Math.max(selectedIndex - 1, 0));
          } else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openDropdown(selectedIndex);
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={cn(
          fieldShellClass,
          'flex w-full min-w-0 items-center text-left outline-none',
          isOpen ? 'border-border bg-background/60' : ''
        )}
      >
        <InsetDividerItem
          showDivider
          className="flex shrink-0 items-center py-2 pl-3 pr-3"
        >
          <NearAccountAvatar accountId={displayAccountId} />
        </InsetDividerItem>
        <span
          className={cn(
            accountTextClass,
            !value.trim() && 'font-normal text-muted-foreground/50'
          )}
        >
          {value.trim() || placeholder}
        </span>
        <ChevronDown
          className={cn(
            'mr-3 h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      <FloatingPanelMenu
        open={isOpen}
        align="full"
        className="space-y-0.5 p-1 md:p-1.5"
        role="listbox"
        aria-label="Member account"
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
            closeDropdown();
          } else if (event.key === 'Tab') {
            closeDropdown();
          }
        }}
      >
        {options.map((accountId, index) => {
          const selected = accountId === value;
          const active = index === activeIndex;

          return (
            <button
              ref={(element) => {
                optionRefs.current[index] = element;
              }}
              key={accountId}
              type="button"
              role="option"
              aria-selected={selected}
              tabIndex={active ? 0 : -1}
              onClick={() => selectAtIndex(index)}
              onMouseEnter={() => setActiveIndex(index)}
              className={cn(
                floatingPanelItemClass,
                'justify-between gap-2',
                selected
                  ? floatingPanelItemSelectedClass
                  : active
                    ? floatingPanelItemActiveClass
                    : ''
              )}
            >
              <span className="flex min-w-0 flex-1 items-center gap-2.5">
                <NearAccountAvatar accountId={accountId} size="sm" />
                <span className="truncate font-mono text-sm">{accountId}</span>
              </span>
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                {selected ? <Check className="h-4 w-4" /> : null}
              </span>
            </button>
          );
        })}
      </FloatingPanelMenu>
    </div>
  );
}

export { isNearAccountInputReady, getNearAccountInputError };
