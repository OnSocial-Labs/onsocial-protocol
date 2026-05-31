'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { FloatingPanelMenu } from '@/components/ui/floating-panel-menu';
import {
  floatingPanelItemClass,
  floatingPanelItemSelectedClass,
} from '@/components/ui/floating-panel';
import { SearchInput } from '@/components/ui/search-input';
import { Skeleton } from '@/components/ui/skeleton';
import { useDropdown } from '@/hooks/use-dropdown';
import { useNavStickyTop } from '@/hooks/use-nav-sticky-top';
import {
  getPortalEndorsementsUrl,
  getPortalStandUrl,
  type PortalEndorsementsMode,
} from '@/lib/portal-config';
import {
  formatProfileCount,
  type StanceDetailKind,
} from '@/lib/profile-social-standings';
import { cn } from '@/lib/utils';

export type ProfileListViewCountAccent = 'blue' | 'purple' | 'gold';

export interface ProfileListViewOption {
  id: string;
  label: string;
  href: string;
  count: number;
  countAccent?: ProfileListViewCountAccent;
}

function viewCountAccentClass(accent?: ProfileListViewCountAccent) {
  if (accent === 'blue') return 'text-[var(--portal-blue)]';
  if (accent === 'purple') return 'text-[var(--portal-purple)]';
  if (accent === 'gold') return 'text-[var(--portal-gold-accent)]';
  return '';
}

export function buildStandViewOptions({
  accountId,
  counts,
  isSelf,
}: {
  accountId: string;
  activeKind?: StanceDetailKind;
  counts: { incoming: number; outgoing: number; mutual: number };
  isSelf: boolean;
}): ProfileListViewOption[] {
  const incomingLabel = isSelf ? 'With you' : 'With them';
  const outgoingLabel = isSelf ? 'Standing with' : 'They stand with';

  return [
    {
      id: 'incoming',
      label: incomingLabel,
      href: getPortalStandUrl(accountId, 'incoming'),
      count: counts.incoming,
      countAccent: 'blue',
    },
    {
      id: 'outgoing',
      label: outgoingLabel,
      href: getPortalStandUrl(accountId, 'outgoing'),
      count: counts.outgoing,
      countAccent: 'blue',
    },
    {
      id: 'mutual',
      label: 'Solidarity',
      href: getPortalStandUrl(accountId, 'mutual'),
      count: counts.mutual,
      countAccent: 'purple',
    },
  ];
}

export function buildEndorsementViewOptions({
  accountId,
  activeMode,
  counts,
  preserveTopic,
}: {
  accountId: string;
  activeMode: PortalEndorsementsMode;
  counts: { received: number; given: number };
  preserveTopic?: string | null;
}): ProfileListViewOption[] {
  const topic =
    preserveTopic?.trim() && activeMode === 'received'
      ? preserveTopic.trim()
      : undefined;

  return [
    {
      id: 'received',
      label: 'Received',
      href: getPortalEndorsementsUrl(accountId, { mode: 'received', topic }),
      count: counts.received,
      countAccent: 'gold',
    },
    {
      id: 'given',
      label: 'Given',
      href: getPortalEndorsementsUrl(accountId, { mode: 'given' }),
      count: counts.given,
      countAccent: 'gold',
    },
  ];
}

export function ProfileListFilterRailSkeleton({
  stickyTop,
  className,
  showTrailing = false,
}: {
  stickyTop: number | string;
  className?: string;
  showTrailing?: boolean;
}) {
  return (
    <div
      className={cn(
        'sticky z-20 mb-3 transition-[top] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
        className
      )}
      style={{ top: stickyTop }}
      aria-hidden
    >
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-[8.75rem] shrink-0 rounded-full bg-foreground/[0.08]" />
        <Skeleton className="h-8 min-w-0 flex-1 rounded-full bg-foreground/[0.06]" />
        {showTrailing ? (
          <Skeleton className="h-8 w-[5.5rem] shrink-0 rounded-full bg-foreground/[0.08]" />
        ) : null}
      </div>
    </div>
  );
}

export function ProfileListFilterRail({
  menuLabel,
  options,
  activeOptionId,
  query,
  onQueryChange,
  searchPlaceholder,
  searchHidden = false,
  clearAriaLabel = 'Clear search',
  maxLength = 80,
  autoFocus = false,
  trailing,
  isLoading = false,
  className,
}: {
  menuLabel: string;
  options: ProfileListViewOption[];
  activeOptionId: string;
  query: string;
  onQueryChange: (value: string) => void;
  searchPlaceholder: string;
  searchHidden?: boolean;
  clearAriaLabel?: string;
  maxLength?: number;
  autoFocus?: boolean;
  trailing?: ReactNode;
  isLoading?: boolean;
  className?: string;
}) {
  const stickyTop = useNavStickyTop();
  const {
    isOpen: viewMenuOpen,
    close: closeViewMenu,
    toggle: toggleViewMenu,
    containerRef: viewMenuRef,
  } = useDropdown();

  if (isLoading) {
    return (
      <ProfileListFilterRailSkeleton
        stickyTop={stickyTop}
        className={className}
        showTrailing={Boolean(trailing)}
      />
    );
  }

  const activeOption =
    options.find((option) => option.id === activeOptionId) ?? options[0];

  return (
    <div
      className={cn(
        'sticky z-20 mb-3 transition-[top] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
        className
      )}
      style={{ top: stickyTop }}
    >
      <div className="flex items-center gap-2">
        <div className="relative shrink-0" ref={viewMenuRef}>
          <button
            type="button"
            onClick={toggleViewMenu}
            aria-haspopup="listbox"
            aria-expanded={viewMenuOpen}
            aria-label={
              viewMenuOpen
                ? `Close ${menuLabel.toLowerCase()} menu`
                : `Open ${menuLabel.toLowerCase()} menu`
            }
            className={cn(
              'flex h-8 max-w-[11.5rem] items-center gap-2 rounded-full border border-border/40 bg-background/65 px-3 text-xs text-muted-foreground shadow-[0_10px_30px_-18px_rgba(15,23,42,0.34)] backdrop-blur-md transition-all duration-300 hover:bg-background/80 hover:text-foreground',
              viewMenuOpen &&
                'bg-background/88 text-foreground shadow-[0_12px_32px_-18px_rgba(15,23,42,0.38)]'
            )}
          >
            <span className="min-w-0 truncate text-foreground/88">
              {activeOption?.label}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className={cn(
                  'inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full border border-border/35 bg-background/55 px-1 portal-type-caption font-semibold tabular-nums leading-none text-muted-foreground/90',
                  viewCountAccentClass(activeOption?.countAccent)
                )}
              >
                {formatProfileCount(activeOption?.count ?? 0)}
              </span>
              <ChevronDown
                className={cn(
                  'h-3.5 w-3.5 shrink-0 transition-transform',
                  viewMenuOpen && 'rotate-180'
                )}
              />
            </span>
          </button>

          <FloatingPanelMenu
            open={viewMenuOpen}
            align="left"
            className="w-60"
            role="listbox"
            aria-label={menuLabel}
          >
            <div className="border-b border-fade-section px-3 py-2.5">
              <p className="mb-0.5 whitespace-nowrap portal-type-label text-muted-foreground/70">
                {menuLabel}
              </p>
              <p className="whitespace-nowrap portal-type-body font-medium text-foreground">
                {activeOption?.label}
              </p>
            </div>

            <div className="space-y-0.5 p-1.5">
              {options.map((option) => {
                const selected = option.id === activeOptionId;
                return (
                  <Link
                    key={option.id}
                    href={option.href}
                    role="option"
                    aria-selected={selected}
                    onClick={closeViewMenu}
                    className={cn(
                      'group justify-between',
                      floatingPanelItemClass,
                      selected && floatingPanelItemSelectedClass
                    )}
                  >
                    <span>{option.label}</span>
                    <span
                      className={cn(
                        'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border portal-type-caption font-semibold tabular-nums leading-none transition-colors',
                        selected
                          ? 'border-border/45 bg-background/70 text-foreground/80'
                          : 'border-border/35 bg-background/40 text-muted-foreground/90 group-hover:border-border/45 group-hover:bg-background/60 group-hover:text-foreground/80',
                        viewCountAccentClass(option.countAccent)
                      )}
                    >
                      {formatProfileCount(option.count)}
                    </span>
                  </Link>
                );
              })}
            </div>
          </FloatingPanelMenu>
        </div>

        {!searchHidden ? (
          <SearchInput
            value={query}
            onValueChange={onQueryChange}
            placeholder={searchPlaceholder}
            size="sm"
            autoFocus={autoFocus}
            maxLength={maxLength}
            containerClassName="min-w-0 flex-1"
            clearAriaLabel={clearAriaLabel}
          />
        ) : null}

        {trailing}
      </div>
    </div>
  );
}
