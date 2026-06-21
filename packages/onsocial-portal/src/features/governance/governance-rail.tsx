'use client';

import Link from 'next/link';
import { createPortal } from 'react-dom';
import { useEffect, useLayoutEffect, useState, type ReactNode, type RefObject } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ChevronDown,
  Info,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Settings2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PortalHoverTooltip } from '@/components/ui/portal-hover-tooltip';
import { FilterPill } from '@/components/ui/filter-pill';
import { SearchInput } from '@/components/ui/search-input';
import {
  floatingPanelClass,
  floatingPanelItemClass,
  floatingPanelItemSelectedClass,
  floatingPanelItemWithMotionClass,
} from '@/components/ui/floating-panel';
import { FloatingPanelMenu } from '@/components/ui/floating-panel-menu';
import { ProtocolMotionArrow } from '@/components/ui/protocol-motion-arrow';
import { useDropdown } from '@/hooks/use-dropdown';
import { useIsMobile } from '@/hooks/use-mobile';
import { useNavStickyTop } from '@/hooks/use-nav-sticky-top';
import { GovernanceDaoInfoModal } from '@/features/governance/governance-dao-info-modal';
import { buildGovernancePathWithBoard } from '@/features/governance/governance-dao-board';
import {
  governanceBoardButtonClass,
  governanceSegmentButtonClass,
} from '@/features/governance/governance-segment-button';
import { GovernanceRailCollapseSection } from '@/features/governance/governance-rail-collapse';
import { useGovernanceRailCompact } from '@/features/governance/use-governance-rail-compact';
import { scaleFadeMotion } from '@/lib/motion';
import type { GovernanceDaoBoard } from '@/features/governance/governance-dao-board';
import type {
  GovernanceLane,
  GovernanceStatusFilter,
} from '@/features/governance/page-utils';
import { cn } from '@/lib/utils';

const railIconButtonClass =
  'h-8 w-8 rounded-full border-border/40 bg-transparent text-muted-foreground hover:bg-transparent hover:text-foreground';

const railIconButtonCompactClass =
  'h-7 w-7 rounded-full border-border/40 bg-transparent text-muted-foreground hover:bg-transparent hover:text-foreground';

const railIconSlotClass = 'flex h-8 w-8 shrink-0 items-center justify-center';

const railIconSlotCompactClass = 'flex h-7 w-7 shrink-0 items-center justify-center';

type GovernanceRailProps = {
  activeBoard: GovernanceDaoBoard;
  boardOptions: Array<{
    value: GovernanceDaoBoard;
    label: string;
    accountId: string;
  }>;
  daoAccountId: string;
  viewerAccountId?: string | null;
  onBoardChange: (board: GovernanceDaoBoard) => void;
  activeLane: GovernanceLane;
  laneOptions: Array<{ value: GovernanceLane; label: string }>;
  loading: boolean;
  onLaneChange: (lane: GovernanceLane) => void;
  onRefresh: () => void;
  onSearchChange: (query: string) => void;
  onSearchSubmit?: () => void;
  onStatusChange: (status: GovernanceStatusFilter) => void;
  searchQuery: string;
  statusCounts: Record<GovernanceStatusFilter, number>;
  statusFilter: GovernanceStatusFilter;
  visibleStatusOptions: Array<{
    value: GovernanceStatusFilter;
    label: string;
  }>;
};

function GovernanceRailRefreshButton({
  loading,
  onRefresh,
  compact = false,
}: {
  loading: boolean;
  onRefresh: () => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? railIconSlotCompactClass : railIconSlotClass}>
      <PortalHoverTooltip
        tooltip={loading ? 'Refreshing proposals' : 'Refresh proposals'}
      >
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onRefresh}
          disabled={loading}
          aria-label="Refresh proposals"
          className={compact ? railIconButtonCompactClass : railIconButtonClass}
        >
          <RefreshCw
            className={cn(
              compact ? 'h-3.5 w-3.5' : 'h-4 w-4',
              loading && 'animate-spin'
            )}
          />
        </Button>
      </PortalHoverTooltip>
    </div>
  );
}

function GovernanceRailIconActions({
  activeBoard,
  loading,
  onOpenInfo,
  onRefresh,
}: {
  activeBoard: GovernanceDaoBoard;
  loading: boolean;
  onOpenInfo: () => void;
  onRefresh: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <div className={railIconSlotClass}>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Open DAO info"
          onClick={onOpenInfo}
          className={railIconButtonClass}
        >
          <Info className="h-4 w-4" />
        </Button>
      </div>

      <div className={railIconSlotClass}>
        <Button asChild variant="outline" size="icon" className={railIconButtonClass}>
          <Link
            href={buildGovernancePathWithBoard('/governance/manage', activeBoard)}
            aria-label="Open position"
          >
            <Settings2 className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      <GovernanceRailRefreshButton loading={loading} onRefresh={onRefresh} />
    </div>
  );
}

function GovernanceRailCreateButton({
  activeBoard,
}: {
  activeBoard: GovernanceDaoBoard;
}) {
  return (
    <Button asChild size="sm" className="shrink-0 gap-1.5 md:gap-2">
      <Link
        href={buildGovernancePathWithBoard('/governance/create', activeBoard)}
      >
        <Plus className="h-3.5 w-3.5 md:h-4 md:w-4" />
        <span className="md:hidden">Create</span>
        <span className="hidden md:inline">Create proposal</span>
      </Link>
    </Button>
  );
}

function GovernanceRailOverflowMenu({
  activeBoard,
  onOpenInfo,
  onExpandFilters,
  onOpenChange,
  portaled = false,
}: {
  activeBoard: GovernanceDaoBoard;
  onOpenInfo: () => void;
  onExpandFilters: () => void;
  onOpenChange?: (open: boolean) => void;
  portaled?: boolean;
}) {
  const {
    isOpen,
    close,
    toggle,
    containerRef,
    panelRef,
  } = useDropdown();

  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  const menuContent = (
    <div className="space-y-0.5 p-1">
      <button
        type="button"
        className={floatingPanelItemClass}
        onClick={() => {
          onExpandFilters();
          close();
        }}
      >
        Back to top
      </button>
      <button
        type="button"
        className={floatingPanelItemClass}
        onClick={() => {
          onOpenInfo();
          close();
        }}
      >
        DAO info
      </button>
      <Link
        href={buildGovernancePathWithBoard('/governance/manage', activeBoard)}
        className={floatingPanelItemWithMotionClass}
        onClick={close}
      >
        Manage position
        <ProtocolMotionArrow className="ml-auto h-3.5 w-3.5" />
      </Link>
      <Link
        href={buildGovernancePathWithBoard('/governance/create', activeBoard)}
        className={floatingPanelItemWithMotionClass}
        onClick={close}
      >
        Create proposal
        <ProtocolMotionArrow className="ml-auto h-3.5 w-3.5" />
      </Link>
    </div>
  );

  return (
    <div className={railIconSlotCompactClass} ref={containerRef}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="More governance actions"
        aria-expanded={isOpen}
        onClick={toggle}
        className={railIconButtonCompactClass}
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </Button>

      {portaled ? (
        <GovernanceRailPortaledMenu
          open={isOpen}
          anchorRef={containerRef}
          panelRef={panelRef}
          align="right"
          menuWidth={208}
          className="w-52"
          ariaLabel="Governance actions"
        >
          {menuContent}
        </GovernanceRailPortaledMenu>
      ) : (
        <FloatingPanelMenu
          open={isOpen}
          align="right"
          className="w-52"
          aria-label="Governance actions"
        >
          {menuContent}
        </FloatingPanelMenu>
      )}
    </div>
  );
}

function GovernanceRailStatusMenuContent({
  activeStatusOption,
  statusFilter,
  statusCounts,
  visibleStatusOptions,
  onStatusChange,
  closeStatusMenu,
}: {
  activeStatusOption?: { value: GovernanceStatusFilter; label: string };
  statusFilter: GovernanceStatusFilter;
  statusCounts: Record<GovernanceStatusFilter, number>;
  visibleStatusOptions: Array<{ value: GovernanceStatusFilter; label: string }>;
  onStatusChange: (status: GovernanceStatusFilter) => void;
  closeStatusMenu: () => void;
}) {
  return (
    <>
      <div className="border-b border-fade-section px-3 py-2.5 md:px-4 md:py-3">
        <p className="mb-0.5 whitespace-nowrap portal-type-label md:text-xs text-muted-foreground/70">
          Proposal Status
        </p>
        <p className="whitespace-nowrap portal-type-body font-medium text-foreground">
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
                closeStatusMenu();
              }}
              className={`group ${floatingPanelItemClass} justify-between ${
                selected ? floatingPanelItemSelectedClass : ''
              }`}
            >
              <span>{option.label}</span>
              <span
                className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border portal-type-caption font-medium tabular-nums leading-none transition-colors ${
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
    </>
  );
}

function GovernanceRailPortaledMenu({
  open,
  anchorRef,
  panelRef,
  align = 'left',
  menuWidth = 224,
  className,
  children,
  role,
  ariaLabel,
}: {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  panelRef: RefObject<HTMLDivElement | null>;
  align?: 'left' | 'right';
  menuWidth?: number;
  className?: string;
  children: ReactNode;
  role?: string;
  ariaLabel?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      return;
    }

    const updatePosition = () => {
      const anchor = anchorRef.current;
      if (!anchor) {
        return;
      }

      const rect = anchor.getBoundingClientRect();
      const maxLeft = Math.max(16, window.innerWidth - menuWidth - 16);
      const alignedLeft =
        align === 'right' ? rect.right - menuWidth : rect.left;

      setPosition({
        top: rect.bottom + 8,
        left: Math.min(Math.max(16, alignedLeft), maxLeft),
      });
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [align, anchorRef, menuWidth, open]);

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          ref={panelRef}
          {...scaleFadeMotion(!!reduceMotion, {
            y: 10,
            scale: 0.97,
            duration: 0.26,
            exitY: 8,
            exitScale: 0.985,
          })}
          style={{
            position: 'fixed',
            top: position.top,
            left: position.left,
            zIndex: 50,
          }}
          className={cn(
            'max-w-[calc(100vw-2rem)] origin-top',
            floatingPanelClass,
            className
          )}
          role={role}
          aria-label={ariaLabel}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}

function GovernanceRailStatusMenuPanel({
  statusMenuOpen,
  activeStatusOption,
  statusFilter,
  statusCounts,
  visibleStatusOptions,
  onStatusChange,
  closeStatusMenu,
  portaled = false,
  anchorRef,
  panelRef,
}: {
  statusMenuOpen: boolean;
  activeStatusOption?: { value: GovernanceStatusFilter; label: string };
  statusFilter: GovernanceStatusFilter;
  statusCounts: Record<GovernanceStatusFilter, number>;
  visibleStatusOptions: Array<{ value: GovernanceStatusFilter; label: string }>;
  onStatusChange: (status: GovernanceStatusFilter) => void;
  closeStatusMenu: () => void;
  portaled?: boolean;
  anchorRef?: RefObject<HTMLElement | null>;
  panelRef?: RefObject<HTMLDivElement | null>;
}) {
  const content = (
    <GovernanceRailStatusMenuContent
      activeStatusOption={activeStatusOption}
      statusFilter={statusFilter}
      statusCounts={statusCounts}
      visibleStatusOptions={visibleStatusOptions}
      onStatusChange={onStatusChange}
      closeStatusMenu={closeStatusMenu}
    />
  );

  if (portaled && anchorRef && panelRef) {
    return (
      <GovernanceRailPortaledMenu
        open={statusMenuOpen}
        anchorRef={anchorRef}
        panelRef={panelRef}
        align="left"
        menuWidth={224}
        className="w-56"
        role="listbox"
        ariaLabel="Filter proposals by status"
      >
        {content}
      </GovernanceRailPortaledMenu>
    );
  }

  return (
    <FloatingPanelMenu
      open={statusMenuOpen}
      align="left"
      className="w-56 md:w-64"
      role="listbox"
      aria-label="Filter proposals by status"
    >
      {content}
    </FloatingPanelMenu>
  );
}

function GovernanceRailStatusMenu({
  statusMenuOpen,
  toggleStatusMenu,
  statusMenuRef,
  activeStatusOption,
  statusFilter,
  statusCounts,
  visibleStatusOptions,
  onStatusChange,
  closeStatusMenu,
}: {
  statusMenuOpen: boolean;
  toggleStatusMenu: () => void;
  statusMenuRef: RefObject<HTMLDivElement | null>;
  activeStatusOption?: { value: GovernanceStatusFilter; label: string };
  statusFilter: GovernanceStatusFilter;
  statusCounts: Record<GovernanceStatusFilter, number>;
  visibleStatusOptions: Array<{ value: GovernanceStatusFilter; label: string }>;
  onStatusChange: (status: GovernanceStatusFilter) => void;
  closeStatusMenu: () => void;
}) {
  return (
    <div className="relative shrink-0" ref={statusMenuRef}>
      <button
        type="button"
        onClick={toggleStatusMenu}
        aria-haspopup="listbox"
        aria-expanded={statusMenuOpen}
        aria-label={
          statusMenuOpen
            ? 'Close status filter menu'
            : 'Open status filter menu'
        }
        className={`flex h-8 items-center gap-2 rounded-full border border-border/40 px-3 text-xs text-muted-foreground shadow-[0_10px_30px_-18px_rgba(15,23,42,0.34)] backdrop-blur-md transition-all duration-300 hover:bg-background/80 hover:text-foreground ${
          statusMenuOpen
            ? 'bg-background/88 text-foreground shadow-[0_12px_32px_-18px_rgba(15,23,42,0.38)]'
            : 'bg-background/65'
        }`}
      >
        <span className="truncate text-foreground/88">
          {activeStatusOption?.label ?? 'Status'}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full border border-border/35 bg-background/55 px-1 portal-type-caption font-medium tabular-nums leading-none text-muted-foreground/90">
            {statusCounts[statusFilter]}
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 transition-transform ${statusMenuOpen ? 'rotate-180' : ''}`}
          />
        </span>
      </button>

      <GovernanceRailStatusMenuPanel
        statusMenuOpen={statusMenuOpen}
        activeStatusOption={activeStatusOption}
        statusFilter={statusFilter}
        statusCounts={statusCounts}
        visibleStatusOptions={visibleStatusOptions}
        onStatusChange={onStatusChange}
        closeStatusMenu={closeStatusMenu}
      />
    </div>
  );
}

function GovernanceRailCompactSummary({
  statusMenuRef,
  statusMenuPanelRef,
  attachStatusMenuRef,
  statusMenuOpen,
  activeBoardLabel,
  activeLaneLabel,
  activeStatusOption,
  statusFilter,
  statusCounts,
  visibleStatusOptions,
  onStatusChange,
  onExpandFilters,
  toggleStatusMenu,
  closeStatusMenu,
}: {
  statusMenuRef: RefObject<HTMLDivElement | null>;
  statusMenuPanelRef: RefObject<HTMLDivElement | null>;
  attachStatusMenuRef: boolean;
  statusMenuOpen: boolean;
  activeBoardLabel: string;
  activeLaneLabel: string;
  activeStatusOption?: { value: GovernanceStatusFilter; label: string };
  statusFilter: GovernanceStatusFilter;
  statusCounts: Record<GovernanceStatusFilter, number>;
  visibleStatusOptions: Array<{ value: GovernanceStatusFilter; label: string }>;
  onStatusChange: (status: GovernanceStatusFilter) => void;
  onExpandFilters: () => void;
  toggleStatusMenu: () => void;
  closeStatusMenu: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <button
        type="button"
        onClick={onExpandFilters}
        className="min-w-0 flex-1 truncate text-left portal-type-label font-medium text-foreground"
        aria-label="Back to top and show all filters"
      >
        <span>{activeBoardLabel}</span>
        <span className="text-muted-foreground/35"> · </span>
        <span>{activeLaneLabel}</span>
        <span className="text-muted-foreground/35"> · </span>
        <span className="text-muted-foreground">
          {activeStatusOption?.label ?? 'Status'}
        </span>
      </button>

      <div
        className="relative shrink-0"
        ref={attachStatusMenuRef ? statusMenuRef : undefined}
      >
        <button
          type="button"
          onClick={toggleStatusMenu}
          aria-haspopup="listbox"
          aria-expanded={statusMenuOpen}
          className="inline-flex items-center gap-1 rounded-full py-0.5 pl-0.5"
          aria-label={
            statusMenuOpen
              ? 'Close proposal status filter menu'
              : 'Open proposal status filter menu'
          }
        >
          <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full border border-border/35 bg-background/55 px-1 portal-type-caption font-medium tabular-nums leading-none text-muted-foreground/90">
            {statusCounts[statusFilter]}
          </span>
          <ChevronDown
            className={cn(
              'h-3 w-3 shrink-0 text-muted-foreground/55 transition-transform',
              statusMenuOpen && 'rotate-180'
            )}
          />
        </button>

        {attachStatusMenuRef ? (
          <GovernanceRailStatusMenuPanel
            statusMenuOpen={statusMenuOpen}
            activeStatusOption={activeStatusOption}
            statusFilter={statusFilter}
            statusCounts={statusCounts}
            visibleStatusOptions={visibleStatusOptions}
            onStatusChange={onStatusChange}
            closeStatusMenu={closeStatusMenu}
            portaled
            anchorRef={statusMenuRef}
            panelRef={statusMenuPanelRef}
          />
        ) : null}
      </div>
    </div>
  );
}

export function GovernanceRail({
  activeBoard,
  boardOptions,
  daoAccountId,
  viewerAccountId = null,
  onBoardChange,
  activeLane,
  laneOptions,
  loading,
  onLaneChange,
  onRefresh,
  onSearchChange,
  onSearchSubmit,
  onStatusChange,
  searchQuery,
  statusCounts,
  statusFilter,
  visibleStatusOptions,
}: GovernanceRailProps) {
  const {
    isOpen: statusMenuOpen,
    close: closeStatusMenu,
    toggle: toggleStatusMenu,
    containerRef: statusMenuRef,
    panelRef: statusMenuPanelRef,
  } = useDropdown();
  const stickyTop = useNavStickyTop();
  const isMobile = useIsMobile();
  const reduceMotion = useReducedMotion();
  const [daoInfoOpen, setDaoInfoOpen] = useState(false);
  const { sentinelRef, compactRail } = useGovernanceRailCompact(isMobile);

  const compactMobile = isMobile && compactRail;
  const animateSections = !reduceMotion;

  useEffect(() => {
    closeStatusMenu();
  }, [compactMobile, closeStatusMenu]);

  const activeBoardOption =
    boardOptions.find((option) => option.value === activeBoard) ??
    boardOptions[0];

  const activeLaneOption =
    laneOptions.find((option) => option.value === activeLane) ?? laneOptions[0];

  const activeStatusOption =
    visibleStatusOptions.find((option) => option.value === statusFilter) ??
    visibleStatusOptions[0];

  const expandFilters = () => {
    window.dispatchEvent(
      new CustomEvent('onsocial:scroll-to', {
        detail: { top: 0, immediate: reduceMotion },
      })
    );
  };

  return (
    <>
      <div ref={sentinelRef} className="h-px w-full shrink-0" aria-hidden />

      <div
        className="sticky z-20 mb-4 overflow-visible rounded-2xl border border-border/50 bg-background/88 px-3 py-2 shadow-[0_18px_42px_-28px_rgba(15,23,42,0.34)] backdrop-blur-xl transition-[top] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none md:mb-6 md:rounded-[1.5rem] md:px-4 md:py-4"
        style={{ top: stickyTop }}
      >
        <GovernanceRailCollapseSection
          collapsed={!compactMobile}
          animate={animateSections}
          className="md:hidden"
        >
          <div className="flex items-center gap-1.5 pb-0.5">
            <GovernanceRailCompactSummary
              statusMenuRef={statusMenuRef}
              statusMenuPanelRef={statusMenuPanelRef}
              attachStatusMenuRef={compactMobile}
              statusMenuOpen={statusMenuOpen}
              activeBoardLabel={activeBoardOption?.label ?? 'DAO'}
              activeLaneLabel={activeLaneOption?.label ?? 'All'}
              activeStatusOption={activeStatusOption}
              statusFilter={statusFilter}
              statusCounts={statusCounts}
              visibleStatusOptions={visibleStatusOptions}
              onStatusChange={onStatusChange}
              onExpandFilters={expandFilters}
              toggleStatusMenu={toggleStatusMenu}
              closeStatusMenu={closeStatusMenu}
            />
            <GovernanceRailOverflowMenu
              activeBoard={activeBoard}
              onOpenInfo={() => setDaoInfoOpen(true)}
              onExpandFilters={expandFilters}
              portaled={compactMobile}
            />
            <GovernanceRailRefreshButton
              loading={loading}
              onRefresh={onRefresh}
              compact
            />
          </div>
        </GovernanceRailCollapseSection>

        <GovernanceRailCollapseSection collapsed={compactMobile} animate={animateSections}>
          <div className="flex flex-col gap-2 md:gap-3">
            <div className="flex items-center justify-between gap-2 border-b border-fade-detail pb-2 md:pb-3">
              <div className="flex min-w-max items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {boardOptions.map((option) => {
                  const isActive = activeBoard === option.value;

                  return (
                    <Button
                      key={option.value}
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => onBoardChange(option.value)}
                      className={governanceBoardButtonClass(isActive)}
                    >
                      {option.label}
                    </Button>
                  );
                })}
              </div>

              <GovernanceRailIconActions
                activeBoard={activeBoard}
                loading={loading}
                onOpenInfo={() => setDaoInfoOpen(true)}
                onRefresh={onRefresh}
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="flex min-w-max items-center gap-2.5 pr-2 sm:gap-3">
                  {laneOptions.map((option) => {
                    const isActive = activeLane === option.value;

                    return (
                      <Button
                        key={option.value}
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => {
                          onLaneChange(option.value);
                        }}
                        className={governanceSegmentButtonClass(isActive)}
                      >
                        {option.label}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <GovernanceRailCreateButton activeBoard={activeBoard} />
            </div>

            <div className="hidden items-center gap-2 border-t border-fade-detail pt-2 md:flex md:gap-4 md:pt-3">
              <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="flex min-w-max items-center gap-2.5 pr-2 sm:gap-3">
                  {visibleStatusOptions.map((option) => {
                    const isActive = statusFilter === option.value;
                    const count = statusCounts[option.value];

                    return (
                      <FilterPill
                        key={option.value}
                        active={isActive}
                        label={option.label}
                        count={count}
                        onClick={() => {
                          onStatusChange(option.value);
                        }}
                      />
                    );
                  })}
                </div>
              </div>

              <SearchInput
                value={searchQuery}
                onValueChange={onSearchChange}
                onSubmit={onSearchSubmit}
                placeholder="Search"
                size="sm"
                containerClassName="min-w-0 flex-1 md:max-w-xl"
              />
            </div>
          </div>
        </GovernanceRailCollapseSection>

        <div
          className={cn(
            'border-t border-fade-detail pt-2 md:hidden',
            !compactMobile && 'flex items-center gap-2'
          )}
        >
          <GovernanceRailCollapseSection
            collapsed={compactMobile}
            animate={animateSections}
            className="shrink-0"
          >
            <GovernanceRailStatusMenu
              statusMenuOpen={statusMenuOpen}
              toggleStatusMenu={toggleStatusMenu}
              statusMenuRef={statusMenuRef}
              activeStatusOption={activeStatusOption}
              statusFilter={statusFilter}
              statusCounts={statusCounts}
              visibleStatusOptions={visibleStatusOptions}
              onStatusChange={onStatusChange}
              closeStatusMenu={closeStatusMenu}
            />
          </GovernanceRailCollapseSection>

          <SearchInput
            value={searchQuery}
            onValueChange={onSearchChange}
            onSubmit={onSearchSubmit}
            placeholder="Search"
            size="sm"
            containerClassName={cn(
              'min-w-0',
              compactMobile ? 'w-full' : 'flex-1'
            )}
          />
        </div>

        <GovernanceDaoInfoModal
          open={daoInfoOpen}
          onOpenChange={setDaoInfoOpen}
          daoAccountId={daoAccountId}
          boardLabel={activeBoardOption?.label ?? 'DAO'}
          activeBoard={activeBoard}
          viewerAccountId={viewerAccountId}
        />
      </div>
    </>
  );
}
