'use client';

import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'framer-motion';
import { ChevronDown, User } from 'lucide-react';
import {
  floatingPanelItemClass,
  floatingPanelItemSelectedClass,
  portalElevatedShadowClass,
} from '@/components/ui/floating-panel';
import { FloatingPanelMenu } from '@/components/ui/floating-panel-menu';
import { ModalCloseButton } from '@/components/ui/modal-close-button';
import { ModalHeader } from '@/components/ui/modal-header';
import { SearchInput } from '@/components/ui/search-input';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';
import { useDropdown } from '@/hooks/use-dropdown';
import { cleanHandle } from '@/lib/endorsements';
import { fadeMotion, scaleFadeMotion } from '@/lib/motion';
import { cn } from '@/lib/utils';

export type NetworkAccountKind = 'mutual' | 'incoming' | 'outgoing';

export interface NetworkAccount {
  accountId: string;
  name: string | null;
  avatarUrl: string | null;
  kind: NetworkAccountKind;
}

interface NetworkModalProps {
  open: boolean;
  centerAccountId: string;
  centerAvatarUrl: string | null;
  centerDisplayName: string;
  accounts: NetworkAccount[];
  isSelf: boolean;
  onClose: () => void;
  onSelectAccount?: (accountId: string) => void;
}

type FilterKind = 'all' | 'mutual' | 'incoming' | 'outgoing';

type NetworkFilterOption = {
  id: FilterKind;
  label: string;
  count: number;
  countAccent?: 'blue' | 'purple';
};

const STAGE_SIZE = 460;
const MIN_STAGE_SIZE = 260;
const CENTER = STAGE_SIZE / 2;
const INNER_RADIUS = 108;
const OUTER_RADIUS = 184;
const CENTER_AVATAR = 84;
const INNER_AVATAR = 40;
const OUTER_AVATAR = 30;
const MAX_INNER = 12;
const MAX_OUTER = 24;

function accountHash(accountId: string): number {
  let hash = 0;
  for (let i = 0; i < accountId.length; i++) {
    hash = ((hash << 5) - hash + accountId.charCodeAt(i)) | 0;
  }
  return hash;
}

function accountIdentity(accountId: string): {
  primaryHue: number;
  secondaryHue: number;
  gradient: string;
} {
  const hash = accountHash(accountId);
  const primaryHue = Math.abs(hash % 360);
  const secondaryHue = (primaryHue + 40 + Math.abs((hash >> 8) % 30)) % 360;
  return {
    primaryHue,
    secondaryHue,
    gradient: `radial-gradient(circle, hsl(${primaryHue} 60% 60% / 0.32), hsl(${secondaryHue} 45% 55% / 0.14), transparent 70%)`,
  };
}

function displayLabel(account: NetworkAccount): string {
  return account.name?.trim() || cleanHandle(account.accountId);
}

interface PlacedNode {
  account: NetworkAccount;
  x: number;
  y: number;
  size: number;
}

const IDLE_FLOAT = 3;
const IDLE_KEYFRAMES = [0, -IDLE_FLOAT, 0, IDLE_FLOAT, 0];
const LINE_EDGE_OVERLAP = 1.5;

function nodeMotion(index: number) {
  return {
    baseDelay: 0.18 + index * 0.022,
    idleDuration: 4 + (index % 5) * 0.6,
    idlePhase: (index % 7) * 0.4,
  };
}

function lineCoordinates(node: PlacedNode, yOffset: number) {
  const nodeCenterY = node.y + yOffset;
  const dx = node.x - CENTER;
  const dy = nodeCenterY - CENTER;
  const length = Math.hypot(dx, dy) || 1;
  const unitX = dx / length;
  const unitY = dy / length;
  const startRadius = CENTER_AVATAR / 2 - LINE_EDGE_OVERLAP;
  const endRadius = node.size / 2 - LINE_EDGE_OVERLAP;

  return {
    x1: CENTER + unitX * startRadius,
    y1: CENTER + unitY * startRadius,
    x2: node.x - unitX * endRadius,
    y2: nodeCenterY - unitY * endRadius,
  };
}

function filterCountAccentClass(accent?: NetworkFilterOption['countAccent']) {
  if (accent === 'blue') return 'text-[var(--portal-blue)]';
  if (accent === 'purple') return 'text-[var(--portal-purple)]';
  return '';
}

function NetworkNodeLabel({ children }: { children: string }) {
  return (
    <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-1.5 -translate-x-1/2 max-w-[140px] truncate rounded-md border border-border/45 bg-background/95 px-2 py-0.5 text-[10px] font-medium text-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
      {children}
    </span>
  );
}

function NetworkOrbitNode({
  node,
  index,
  dimmed,
  reduceMotion,
  onSelectAccount,
}: {
  node: PlacedNode;
  index: number;
  dimmed: boolean;
  reduceMotion: boolean;
  onSelectAccount?: (accountId: string) => void;
}) {
  const isMutual = node.account.kind === 'mutual';
  const { baseDelay, idleDuration, idlePhase } = nodeMotion(index);
  const yOffset = useMotionValue(0);
  const lineX1 = useTransform(
    yOffset,
    (offset) => lineCoordinates(node, offset).x1
  );
  const lineY1 = useTransform(
    yOffset,
    (offset) => lineCoordinates(node, offset).y1
  );
  const lineX2 = useTransform(
    yOffset,
    (offset) => lineCoordinates(node, offset).x2
  );
  const lineY2 = useTransform(
    yOffset,
    (offset) => lineCoordinates(node, offset).y2
  );

  useEffect(() => {
    if (reduceMotion) {
      yOffset.set(0);
      return undefined;
    }

    const controls = animate(yOffset, IDLE_KEYFRAMES, {
      duration: idleDuration,
      repeat: Infinity,
      ease: 'easeInOut',
      delay: baseDelay + idlePhase,
    });

    return () => controls.stop();
  }, [baseDelay, idleDuration, idlePhase, reduceMotion, yOffset]);

  return (
    <>
      <svg
        className="pointer-events-none absolute inset-0"
        width={STAGE_SIZE}
        height={STAGE_SIZE}
        viewBox={`0 0 ${STAGE_SIZE} ${STAGE_SIZE}`}
        aria-hidden="true"
      >
        <motion.line
          x1={lineX1}
          y1={lineY1}
          x2={lineX2}
          y2={lineY2}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: baseDelay, duration: 0.3 }}
          stroke={isMutual ? 'var(--portal-purple)' : 'var(--portal-blue)'}
          strokeOpacity={dimmed ? 0.05 : isMutual ? 0.34 : 0.18}
          strokeWidth={1}
          className="transition-[stroke-opacity] duration-300"
        />
      </svg>

      <motion.button
        key={node.account.accountId}
        type="button"
        onClick={() => onSelectAccount?.(node.account.accountId)}
        className="group absolute z-10 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--portal-blue-focus-border)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        style={{
          left: node.x,
          top: node.y,
          width: node.size,
          height: node.size,
          marginLeft: -node.size / 2,
          marginTop: -node.size / 2,
          y: yOffset,
        }}
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{
          scale: 1,
          opacity: dimmed ? 0.18 : 1,
        }}
        transition={{
          scale: {
            delay: baseDelay,
            duration: 0.32,
            ease: [0.22, 1, 0.36, 1],
          },
          opacity: {
            duration: 0.18,
          },
        }}
        aria-label={`Open ${displayLabel(node.account)}`}
      >
        <div
          className={cn(
            'h-full w-full overflow-hidden rounded-full border-2 bg-muted/40 transition-[border-color,box-shadow]',
            isMutual
              ? 'border-[var(--portal-purple)]/45 group-hover:border-[var(--portal-purple)] group-hover:shadow-[0_0_16px_color-mix(in_srgb,var(--portal-purple)_28%,transparent)]'
              : 'border-[var(--portal-blue)]/35 group-hover:border-[var(--portal-blue)] group-hover:shadow-[0_0_16px_color-mix(in_srgb,var(--portal-blue)_24%,transparent)]'
          )}
        >
          {node.account.avatarUrl ? (
            <img
              src={node.account.avatarUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <User className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
        </div>
        <NetworkNodeLabel>{displayLabel(node.account)}</NetworkNodeLabel>
      </motion.button>
    </>
  );
}

function CenterNetworkAccount({
  accountId,
  avatarUrl,
  displayName,
  onSelectAccount,
}: {
  accountId: string;
  avatarUrl: string | null;
  displayName: string;
  onSelectAccount?: (accountId: string) => void;
}) {
  const clickable = Boolean(onSelectAccount);
  const identity = accountIdentity(accountId);
  const identityStyle = {
    '--center-identity': `hsl(${identity.primaryHue} 60% 60%)`,
    '--center-identity-border': `hsl(${identity.primaryHue} 60% 60% / 0.55)`,
    '--center-identity-glow-soft': `hsl(${identity.primaryHue} 60% 60% / 0.18)`,
    '--center-identity-glow-strong': `hsl(${identity.primaryHue} 60% 60% / 0.3)`,
    '--center-identity-focus': `hsl(${identity.primaryHue} 60% 60% / 0.5)`,
  } as CSSProperties;

  const content = (
    <>
      <div
        className="pointer-events-none absolute inset-[-44px] rounded-full"
        style={{ background: identity.gradient }}
        aria-hidden="true"
      />
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full border-[3px] border-[var(--center-identity-border)] bg-muted/40 shadow-[0_0_18px_var(--center-identity-glow-soft)] transition-[border-color,box-shadow] group-hover:border-[var(--center-identity)] group-hover:shadow-[0_0_28px_var(--center-identity-glow-strong)]">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <User className="h-8 w-8 text-muted-foreground" />
        )}
      </div>
      <NetworkNodeLabel>{displayName}</NetworkNodeLabel>
    </>
  );

  const sharedClassName =
    'group absolute z-20 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--center-identity-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-background';
  const sharedStyle: CSSProperties = {
    left: CENTER,
    top: CENTER,
    width: CENTER_AVATAR,
    height: CENTER_AVATAR,
    marginLeft: -CENTER_AVATAR / 2,
    marginTop: -CENTER_AVATAR / 2,
    ...identityStyle,
  };

  if (!clickable) {
    return (
      <div className={sharedClassName} style={sharedStyle}>
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={cn(sharedClassName, 'cursor-pointer')}
      style={sharedStyle}
      onClick={() => onSelectAccount?.(accountId)}
      aria-label={`Open ${displayName}`}
    >
      {content}
    </button>
  );
}

export function NetworkModal({
  open,
  centerAccountId,
  centerAvatarUrl,
  centerDisplayName,
  accounts,
  isSelf,
  onClose,
  onSelectAccount,
}: NetworkModalProps) {
  const [sessionKey, setSessionKey] = useState(0);

  const handleClose = useCallback(() => {
    onClose();
    setSessionKey((key) => key + 1);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence initial={false}>
      {open ? (
        <NetworkModalContent
          key={sessionKey}
          centerAccountId={centerAccountId}
          centerAvatarUrl={centerAvatarUrl}
          centerDisplayName={centerDisplayName}
          accounts={accounts}
          isSelf={isSelf}
          onClose={handleClose}
          onSelectAccount={onSelectAccount}
        />
      ) : null}
    </AnimatePresence>,
    document.body
  );
}

function NetworkModalContent({
  centerAccountId,
  centerAvatarUrl,
  centerDisplayName,
  accounts,
  isSelf,
  onClose,
  onSelectAccount,
}: Omit<NetworkModalProps, 'open'>) {
  const reduceMotion = useReducedMotion();
  const scrollRef = useRef<HTMLDivElement>(null);
  const {
    isOpen: filterMenuOpen,
    close: closeFilterMenu,
    toggle: toggleFilterMenu,
    containerRef: filterMenuRef,
  } = useDropdown();
  const [filter, setFilter] = useState<FilterKind>('all');
  const [query, setQuery] = useState('');
  const [stageSize, setStageSize] = useState(STAGE_SIZE);
  useBodyScrollLock(true, scrollRef);

  useEffect(() => {
    const updateStageSize = () => {
      const viewportPadding = window.innerWidth < 640 ? 48 : 96;
      const availableWidth = Math.max(
        MIN_STAGE_SIZE,
        window.innerWidth - viewportPadding
      );
      setStageSize(Math.min(STAGE_SIZE, availableWidth));
    };

    updateStageSize();
    window.addEventListener('resize', updateStageSize);
    return () => window.removeEventListener('resize', updateStageSize);
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (filterMenuOpen) {
        closeFilterMenu();
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [closeFilterMenu, filterMenuOpen, onClose]);

  const counts = useMemo(() => {
    let mutual = 0;
    let incoming = 0;
    let outgoing = 0;
    for (const account of accounts) {
      if (account.kind === 'mutual') mutual += 1;
      else if (account.kind === 'incoming') incoming += 1;
      else outgoing += 1;
    }
    return { mutual, incoming, outgoing };
  }, [accounts]);

  const placedNodes: PlacedNode[] = useMemo(() => {
    const mutual = accounts.filter((a) => a.kind === 'mutual');
    const others = accounts.filter((a) => a.kind !== 'mutual');

    const inner = mutual.slice(0, MAX_INNER);
    const outer = others.slice(0, MAX_OUTER);

    const placeRing = (
      ringAccounts: NetworkAccount[],
      radius: number,
      size: number,
      offset: number
    ): PlacedNode[] => {
      const count = ringAccounts.length;
      if (count === 0) return [];
      return ringAccounts.map((account, index) => {
        const angle = -Math.PI / 2 + offset + (index / count) * Math.PI * 2;
        return {
          account,
          x: CENTER + Math.cos(angle) * radius,
          y: CENTER + Math.sin(angle) * radius,
          size,
        };
      });
    };

    return [
      ...placeRing(inner, INNER_RADIUS, INNER_AVATAR, 0),
      ...placeRing(
        outer,
        OUTER_RADIUS,
        OUTER_AVATAR,
        outer.length > 0 ? Math.PI / outer.length : 0
      ),
    ];
  }, [accounts]);

  const normalizedQuery = query.trim().toLowerCase();
  const matchesFilter = (
    account: NetworkAccount,
    activeFilter = filter
  ): boolean => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'mutual') return account.kind === 'mutual';
    if (activeFilter === 'incoming') {
      return account.kind === 'incoming' || account.kind === 'mutual';
    }
    return account.kind === 'outgoing' || account.kind === 'mutual';
  };
  const matchesQuery = (account: NetworkAccount): boolean => {
    if (!normalizedQuery) return true;
    return (
      displayLabel(account).toLowerCase().includes(normalizedQuery) ||
      account.accountId.toLowerCase().includes(normalizedQuery)
    );
  };
  const isDimmed = (account: NetworkAccount): boolean =>
    !matchesFilter(account) || !matchesQuery(account);

  const networkMeta =
    accounts.length === 0
      ? 'NO CONNECTIONS YET'
      : `${accounts.length} ${accounts.length === 1 ? 'CONNECTION' : 'CONNECTIONS'}`;

  const filterOptions: NetworkFilterOption[] = [
    { id: 'all', label: 'All', count: accounts.length },
    {
      id: 'mutual',
      label: 'Solidarity',
      count: counts.mutual,
      countAccent: 'purple',
    },
    {
      id: 'incoming',
      label: isSelf ? 'Stand with you' : 'Stand with them',
      count: counts.incoming + counts.mutual,
      countAccent: 'blue',
    },
    {
      id: 'outgoing',
      label: isSelf ? 'You stand with' : 'They stand with',
      count: counts.outgoing + counts.mutual,
      countAccent: 'blue',
    },
  ];
  const activeFilterOption =
    filterOptions.find((option) => option.id === filter) ?? filterOptions[0];
  const stageScale = stageSize / STAGE_SIZE;

  return (
    <motion.div
      {...fadeMotion(reduceMotion ? 0 : 0.2)}
      data-lenis-prevent
      className="fixed inset-0 z-[2147483647] flex items-center justify-center px-4 py-6"
    >
      <button
        type="button"
        className="absolute inset-0 bg-background/80 backdrop-blur-xl"
        aria-label="Close network"
        onClick={onClose}
      />

      <motion.div
        {...scaleFadeMotion(!!reduceMotion, {
          y: 16,
          scale: 0.97,
          duration: 0.24,
          exitY: 10,
          exitScale: 0.98,
        })}
        role="dialog"
        aria-modal="true"
        aria-labelledby="network-modal-title"
        className={cn(
          'relative flex h-[min(720px,calc(100vh-2rem))] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border/67 bg-background/98',
          portalElevatedShadowClass
        )}
      >
        <ModalHeader
          titleId="network-modal-title"
          title={isSelf ? 'Your network' : `${centerDisplayName}'s network`}
          description={networkMeta}
          descriptionVariant="meta"
          actions={
            <ModalCloseButton ariaLabel="Close network" onClick={onClose} />
          }
        />

        <div className="shrink-0 space-y-3 px-5 pb-3">
          <div className="flex items-center gap-2">
            <div className="relative shrink-0" ref={filterMenuRef}>
              <button
                type="button"
                onClick={toggleFilterMenu}
                aria-haspopup="listbox"
                aria-expanded={filterMenuOpen}
                aria-label={
                  filterMenuOpen
                    ? 'Close relationship filter menu'
                    : 'Open relationship filter menu'
                }
                className={cn(
                  'flex h-8 max-w-[11.5rem] items-center gap-2 rounded-full border border-border/40 bg-background/65 px-3 text-xs text-muted-foreground shadow-[0_10px_30px_-18px_rgba(15,23,42,0.34)] backdrop-blur-md transition-all duration-300 hover:bg-background/80 hover:text-foreground',
                  filterMenuOpen &&
                    'bg-background/88 text-foreground shadow-[0_12px_32px_-18px_rgba(15,23,42,0.38)]'
                )}
              >
                <span className="min-w-0 truncate text-foreground/88">
                  {activeFilterOption.label}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className={cn(
                      'inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full border border-border/35 bg-background/55 px-1 text-[10px] font-semibold tabular-nums leading-none text-muted-foreground/90',
                      filterCountAccentClass(activeFilterOption.countAccent)
                    )}
                  >
                    {activeFilterOption.count}
                  </span>
                  <ChevronDown
                    className={cn(
                      'h-3.5 w-3.5 shrink-0 transition-transform',
                      filterMenuOpen && 'rotate-180'
                    )}
                  />
                </span>
              </button>

              <FloatingPanelMenu
                open={filterMenuOpen}
                align="left"
                className="w-60"
                role="listbox"
                aria-label="Filter network by relationship"
              >
                <div className="border-b border-fade-section px-3 py-2.5">
                  <p className="mb-0.5 whitespace-nowrap text-[11px] text-muted-foreground/70">
                    Relationship
                  </p>
                  <p className="whitespace-nowrap text-[13px] font-medium text-foreground">
                    {activeFilterOption.label}
                  </p>
                </div>

                <div className="space-y-0.5 p-1.5">
                  {filterOptions.map((option) => {
                    const selected = option.id === filter;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => {
                          setFilter(option.id);
                          closeFilterMenu();
                        }}
                        className={cn(
                          'group justify-between',
                          floatingPanelItemClass,
                          selected && floatingPanelItemSelectedClass
                        )}
                      >
                        <span>{option.label}</span>
                        <span
                          className={cn(
                            'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold tabular-nums leading-none transition-colors',
                            selected
                              ? 'border-border/45 bg-background/70 text-foreground/80'
                              : 'border-border/35 bg-background/40 text-muted-foreground/90 group-hover:border-border/45 group-hover:bg-background/60 group-hover:text-foreground/80',
                            filterCountAccentClass(option.countAccent)
                          )}
                        >
                          {option.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </FloatingPanelMenu>
            </div>

            <SearchInput
              value={query}
              onValueChange={setQuery}
              placeholder="Search"
              size="sm"
              maxLength={80}
              containerClassName="min-w-0 flex-1"
              clearAriaLabel="Clear network search"
            />
          </div>
        </div>

        <div
          ref={scrollRef}
          className="relative min-h-0 flex-1 overflow-hidden"
        >
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at 50% 50%, hsl(var(--foreground) / 0.05), transparent 70%)',
            }}
          />

          <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
            <div
              className="relative"
              style={{ width: stageSize, height: stageSize }}
            >
              <div
                className="absolute left-1/2 top-1/2"
                style={{
                  width: STAGE_SIZE,
                  height: STAGE_SIZE,
                  transform: `translate(-50%, -50%) scale(${stageScale})`,
                  transformOrigin: 'center',
                }}
              >
                {placedNodes.map((node, index) => (
                  <NetworkOrbitNode
                    key={node.account.accountId}
                    node={node}
                    index={index}
                    dimmed={isDimmed(node.account)}
                    reduceMotion={Boolean(reduceMotion)}
                    onSelectAccount={onSelectAccount}
                  />
                ))}

                <CenterNetworkAccount
                  accountId={centerAccountId}
                  avatarUrl={centerAvatarUrl}
                  displayName={centerDisplayName}
                  onSelectAccount={onSelectAccount}
                />
              </div>
            </div>
          </div>

          {accounts.length === 0 ? (
            <div className="absolute inset-x-0 bottom-12 px-6 text-center text-[12px] text-muted-foreground/55">
              {isSelf
                ? 'No standing connections yet. Stand with someone to start your network.'
                : `${centerDisplayName} has no standing connections yet.`}
            </div>
          ) : null}
        </div>
      </motion.div>
    </motion.div>
  );
}
