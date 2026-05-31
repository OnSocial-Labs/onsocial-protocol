'use client';

import { SearchInput } from '@/components/ui/search-input';
import { useNavStickyTop } from '@/hooks/use-nav-sticky-top';
import { stickyRailShadowClass } from '@/lib/profile-page-layout';
import { cn } from '@/lib/utils';

export const profileListSearchInputClass =
  'w-full border-border/50 bg-background/88 backdrop-blur-xl';

export function ProfileListSearchBar({
  query,
  onQueryChange,
  placeholder,
  autoFocus = false,
  clearAriaLabel = 'Clear search',
  maxLength = 80,
  stickyToNav = false,
  embedded = false,
  className,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  clearAriaLabel?: string;
  maxLength?: number;
  /** Pin below the portal nav while the page scrolls (discover page). */
  stickyToNav?: boolean;
  /** Omit outer sticky chrome when nested in another sticky container. */
  embedded?: boolean;
  className?: string;
}) {
  const stickyTop = useNavStickyTop();

  return (
    <div
      className={cn(
        !embedded &&
          stickyToNav &&
          'sticky z-20 transition-[top] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
        className
      )}
      style={!embedded && stickyToNav ? { top: stickyTop } : undefined}
    >
      <SearchInput
        value={query}
        onValueChange={onQueryChange}
        placeholder={placeholder}
        size="lg"
        autoFocus={autoFocus}
        maxLength={maxLength}
        clearAriaLabel={clearAriaLabel}
        containerClassName={cn(
          profileListSearchInputClass,
          embedded ? 'shadow-none' : stickyRailShadowClass
        )}
      />
    </div>
  );
}

export function ProfileDiscoverySearchRail({
  query,
  onQueryChange,
  autoFocus = false,
  className,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  autoFocus?: boolean;
  className?: string;
}) {
  return (
    <ProfileListSearchBar
      query={query}
      onQueryChange={onQueryChange}
      autoFocus={autoFocus}
      className={className}
      stickyToNav
      placeholder="Search names or accounts"
      clearAriaLabel="Clear profile search"
    />
  );
}
