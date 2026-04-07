import Link from 'next/link';
import { ChevronDown, Plus, RefreshCw, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/search-input';
import {
  floatingPanelItemClass,
  floatingPanelItemSelectedClass,
} from '@/components/ui/floating-panel';
import { FloatingPanelMenu } from '@/components/ui/floating-panel-menu';
import { cn } from '@/lib/utils';
import { useDropdown } from '@/hooks/use-dropdown';
import type {
  GovernanceLane,
  GovernanceStatusFilter,
} from '@/features/governance/page-utils';

type GovernanceRailProps = {
  activeLane: GovernanceLane;
  laneOptions: Array<{ value: GovernanceLane; label: string }>;
  loading: boolean;
  onLaneChange: (lane: GovernanceLane) => void;
  onRefresh: () => void;
  onSearchChange: (query: string) => void;
  onStatusChange: (status: GovernanceStatusFilter) => void;
  searchQuery: string;
  statusCounts: Record<GovernanceStatusFilter, number>;
  statusFilter: GovernanceStatusFilter;
  visibleStatusOptions: Array<{
    value: GovernanceStatusFilter;
    label: string;
  }>;
};

export function GovernanceRail({
  activeLane,
  laneOptions,
  loading,
  onLaneChange,
  onRefresh,
  onSearchChange,
  onStatusChange,
  searchQuery,
  statusCounts,
  statusFilter,
  visibleStatusOptions,
}: GovernanceRailProps) {
  const statusMenu = useDropdown();

  const activeStatusOption =
    visibleStatusOptions.find((option) => option.value === statusFilter) ??
    visibleStatusOptions[0];

  return (
    <div className="sticky top-[68px] z-20 mb-6 rounded-2xl border border-border/50 bg-background/88 px-3 py-3 shadow-[0_18px_42px_-28px_rgba(15,23,42,0.34)] backdrop-blur-xl md:top-24 md:rounded-[1.5rem] md:px-4 md:py-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex min-w-max items-center gap-2.5 pr-2 sm:gap-3">
              {laneOptions.map((option) => {
                const isActive = activeLane === option.value;

                return (
                  <Button
                    key={option.value}
                    type="button"
                    variant={isActive ? 'outline' : 'ghost'}
                    size="xs"
                    onClick={() => {
                      onLaneChange(option.value);
                    }}
                    className={
                      isActive
                        ? 'border-border/60 bg-background font-medium text-foreground shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]'
                        : 'border-transparent text-muted-foreground hover:border-border/40 hover:text-foreground'
                    }
                  >
                    {option.label}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <div className="flex items-center gap-2 md:hidden">
              <Button
                asChild
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-full border-border/40 bg-transparent text-muted-foreground hover:bg-transparent hover:text-foreground"
              >
                <Link href="/governance/manage" aria-label="Manage governance">
                  <Settings2 className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={onRefresh}
                disabled={loading}
                title={loading ? 'Refreshing proposals' : 'Refresh proposals'}
                aria-label="Refresh proposals"
                className="h-8 w-8 rounded-full border-border/40 bg-transparent text-muted-foreground hover:bg-transparent hover:text-foreground"
              >
                <RefreshCw
                  className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
                />
              </Button>
            </div>

            <div className="hidden items-center gap-2 md:flex">
              <Button asChild size="sm" className="gap-2">
                <Link href="/governance/manage">
                  <Plus className="h-4 w-4" />
                  <span>Create proposal</span>
                </Link>
              </Button>

              <Button
                asChild
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-full border-border/40 bg-transparent text-muted-foreground hover:bg-transparent hover:text-foreground md:h-9 md:w-9"
              >
                <Link href="/governance/manage" aria-label="Manage governance">
                  <Settings2 className="h-4 w-4" />
                </Link>
              </Button>

              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={onRefresh}
                disabled={loading}
                title={loading ? 'Refreshing proposals' : 'Refresh proposals'}
                aria-label="Refresh proposals"
                className="h-8 w-8 rounded-full border-border/40 bg-transparent text-muted-foreground hover:bg-transparent hover:text-foreground md:h-9 md:w-9"
              >
                <RefreshCw
                  className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
                />
              </Button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <div className="relative" ref={statusMenu.containerRef}>
            <button
              type="button"
              onClick={statusMenu.toggle}
              aria-haspopup="listbox"
              aria-expanded={statusMenu.isOpen}
              aria-label={
                statusMenu.isOpen
                  ? 'Close status filter menu'
                  : 'Open status filter menu'
              }
              className={`flex h-8 items-center gap-2 rounded-full border border-border/40 px-3 text-xs text-muted-foreground shadow-[0_10px_30px_-18px_rgba(15,23,42,0.34)] backdrop-blur-md transition-all duration-300 hover:bg-background/80 hover:text-foreground ${
                statusMenu.isOpen
                  ? 'bg-background/88 text-foreground shadow-[0_12px_32px_-18px_rgba(15,23,42,0.38)]'
                  : 'bg-background/65'
              }`}
            >
              <span className="truncate text-foreground/88">
                {activeStatusOption?.label ?? 'Status'}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full border border-border/35 bg-background/55 px-1 text-[10px] font-medium tabular-nums leading-none text-muted-foreground/90">
                  {statusCounts[statusFilter]}
                </span>
                <ChevronDown
                  className={`h-3.5 w-3.5 shrink-0 transition-transform ${statusMenu.isOpen ? 'rotate-180' : ''}`}
                />
              </span>
            </button>

            <FloatingPanelMenu
              open={statusMenu.isOpen}
              align="left"
              className="w-56 md:w-64"
              role="listbox"
              aria-label="Filter proposals by status"
            >
              <div className="border-b border-fade-section px-3 py-2.5 md:px-4 md:py-3">
                <p className="mb-0.5 whitespace-nowrap text-[11px] md:text-xs text-muted-foreground/70">
                  Proposal Status
                </p>
                <p className="whitespace-nowrap text-[13px] md:text-sm font-medium text-foreground">
                  {activeStatusOption?.label ?? 'Status'}
                </p>
              </div>

              <div className="space-y-0.5 p-1 md:p-1.5">
                {visibleStatusOptions.map((option) => {
                  const selected = option.value === statusFilter;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => {
                        onStatusChange(option.value);
                        statusMenu.close();
                      }}
                      className={`group ${floatingPanelItemClass} justify-between ${
                        selected ? floatingPanelItemSelectedClass : ''
                      }`}
                    >
                      <span>{option.label}</span>
                      <span
                        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-medium tabular-nums leading-none transition-colors ${
                          selected
                            ? 'border-border/45 bg-background/70 text-foreground/80'
                            : 'border-border/35 bg-background/40 text-muted-foreground/90 group-hover:border-border/45 group-hover:bg-background/60 group-hover:text-foreground/80'
                        }`}
                      >
                        {statusCounts[option.value]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </FloatingPanelMenu>
          </div>

          <SearchInput
            value={searchQuery}
            onValueChange={onSearchChange}
            placeholder="Search"
            size="sm"
            containerClassName="min-w-0 flex-1"
          />

          <Button asChild size="sm" className="shrink-0 gap-1.5">
            <Link href="/governance/manage">
              <Plus className="h-3.5 w-3.5" />
              <span>Create</span>
            </Link>
          </Button>
        </div>

        <div className="hidden items-center justify-between gap-4 border-t border-fade-detail pt-3 md:flex">
          <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex min-w-max items-center gap-2.5 pr-2 sm:gap-3">
              {visibleStatusOptions.map((option) => {
                const isActive = statusFilter === option.value;
                const count = statusCounts[option.value];

                return (
                  <Button
                    key={option.value}
                    type="button"
                    variant={isActive ? 'outline' : 'ghost'}
                    size="xs"
                    onClick={() => {
                      onStatusChange(option.value);
                    }}
                    className={cn(
                      'gap-1.5',
                      isActive
                        ? 'border-border/60 bg-background font-medium text-foreground shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]'
                        : 'border-transparent text-muted-foreground hover:border-border/40 hover:text-foreground'
                    )}
                  >
                    <span>{option.label}</span>
                    <span
                      className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full border px-1 text-[10px] font-medium tabular-nums leading-none ${
                        isActive
                          ? 'border-border/40 bg-background/60 text-foreground/70'
                          : 'border-transparent text-muted-foreground/80'
                      }`}
                    >
                      {count}
                    </span>
                  </Button>
                );
              })}
            </div>
          </div>

          <SearchInput
            value={searchQuery}
            onValueChange={onSearchChange}
            placeholder="Search"
            containerClassName="w-[17rem] shrink-0 lg:w-[20rem]"
          />
        </div>
      </div>
    </div>
  );
}
