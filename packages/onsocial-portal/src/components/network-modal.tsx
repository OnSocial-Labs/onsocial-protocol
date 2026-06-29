'use client';

import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AnimatePresence,
  animate,
  motion,
  motionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
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
import { useDropdown } from '@onsocial/ui';
import { cleanHandle } from '@/lib/endorsements';
import { fadeMotion, scaleFadeMotion } from '@/lib/motion';
import Link from 'next/link';
import {
  getPortalProfileUrl,
  getPortalStandUrl,
  syncPortalNetworkUrl,
  type PortalNetworkFilter,
  type PortalStandKind,
} from '@/lib/portal-config';
import {
  isAbortLikeError,
  isProfileSearchQuery,
  normalizeProfileSearchQuery,
} from '@/lib/profile-account-search';
import { fetchPortalProfileNetwork } from '@/lib/portal-profile-network-client';
import type { PortalProfileNetworkSearchMeta } from '@/lib/portal-profile-network';
import {
  type NetworkAccount,
  type NetworkAccountKind,
} from '@/lib/profile-network-accounts';
import {
  NETWORK_GRAPH_RING_CAP,
  networkFilterCounts,
  networkFilterToStandKind,
  networkUniqueConnectionTotal,
  type NetworkStandingCounts,
} from '@/lib/profile-network-graph';
import { formatProfileCount } from '@/lib/profile-social-standings';
import { cn } from '@/lib/utils';

export type { NetworkAccount, NetworkAccountKind };

export type NetworkFilterKind = 'all' | 'mutual' | 'incoming' | 'outgoing';

interface NetworkModalProps {
  open: boolean;
  centerAccountId: string;
  centerAvatarUrl: string | null;
  centerDisplayName: string;
  accounts: NetworkAccount[];
  totalCounts?: NetworkStandingCounts;
  viewerAccountId?: string | null;
  isSelf: boolean;
  onClose: () => void;
  onSelectAccount?: (accountId: string) => void;
}

export interface NetworkPanelProps {
  variant: 'page' | 'modal';
  centerAccountId: string;
  centerAvatarUrl: string | null;
  centerDisplayName: string;
  accounts: NetworkAccount[];
  totalCounts?: NetworkStandingCounts;
  viewerAccountId?: string | null;
  isSelf: boolean;
  initialFilter?: NetworkFilterKind;
  initialQuery?: string;
  /** Keep `q` / `filter` in the address bar on the network page. */
  syncUrl?: boolean;
  onClose?: () => void;
  onSelectAccount?: (accountId: string) => void;
}

type FilterKind = NetworkFilterKind;

type NetworkFilterOption = {
  id: FilterKind;
  label: string;
  count: number;
  countAccent?: 'blue' | 'purple';
};

const STAGE_SIZE = 460;
const MIN_STAGE_SIZE = 260;
const INNER_RADIUS = 108;
const MID_RADIUS = 146;
const OUTER_RADIUS = 184;
const CENTER_AVATAR = 84;
const INNER_AVATAR = 40;
const MID_AVATAR = 34;
const OUTER_AVATAR = 30;
const MAX_INNER = NETWORK_GRAPH_RING_CAP.mutual;
const MAX_MID = NETWORK_GRAPH_RING_CAP.incoming;
const MAX_OUTER = NETWORK_GRAPH_RING_CAP.outgoing;
/** Minimum angle between any two spokes (global, all rings). */
const MIN_SPOKE_ANGLE_RAD = 0.34;
const GOLDEN_ANGLE_RAD = 2.399963229728653;
const NODE_RING_PADDING_PX = 10;

interface StageLayoutMetrics {
  stageSize: number;
  center: number;
  innerRadius: number;
  midRadius: number;
  outerRadius: number;
  centerAvatar: number;
  innerAvatar: number;
  midAvatar: number;
  outerAvatar: number;
  nodePadding: number;
  floatAmplitude: number;
}

function stageLayoutMetrics(stageSize: number): StageLayoutMetrics {
  const scale = stageSize / STAGE_SIZE;
  return {
    stageSize,
    center: stageSize / 2,
    innerRadius: INNER_RADIUS * scale,
    midRadius: MID_RADIUS * scale,
    outerRadius: OUTER_RADIUS * scale,
    centerAvatar: Math.round(CENTER_AVATAR * scale),
    innerAvatar: Math.round(INNER_AVATAR * scale),
    midAvatar: Math.round(MID_AVATAR * scale),
    outerAvatar: Math.round(OUTER_AVATAR * scale),
    nodePadding: NODE_RING_PADDING_PX * scale,
    floatAmplitude: IDLE_FLOAT * scale,
  };
}

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
  unitX: number;
  unitY: number;
}

function angularDistance(a: number, b: number): number {
  const tau = Math.PI * 2;
  const delta = Math.abs(a - b) % tau;
  return Math.min(delta, tau - delta);
}

function minAngularGapForRing(
  count: number,
  radius: number,
  avatarSize: number
): number {
  if (count <= 1) return Math.PI * 2;
  const chord = avatarSize + NODE_RING_PADDING_PX;
  const fromChord = 2 * Math.asin(Math.min(1, chord / (2 * radius)));
  return Math.max((Math.PI * 2) / count, fromChord, MIN_SPOKE_ANGLE_RAD);
}

function spokeAngleIsFree(
  angle: number,
  blockedAngles: number[],
  minGap: number
): boolean {
  return blockedAngles.every(
    (blocked) => angularDistance(angle, blocked) >= minGap
  );
}

function findFreeSpokeAngle(
  preferred: number,
  blockedAngles: number[],
  minGap: number
): number {
  if (spokeAngleIsFree(preferred, blockedAngles, minGap)) {
    return preferred;
  }

  for (let step = 1; step <= 64; step++) {
    const shift = minGap * step;
    for (const sign of [1, -1] as const) {
      const candidate = preferred + sign * shift;
      if (spokeAngleIsFree(candidate, blockedAngles, minGap)) {
        return candidate;
      }
    }
  }

  for (let step = 1; step <= 90; step++) {
    const candidate = preferred + step * GOLDEN_ANGLE_RAD;
    if (spokeAngleIsFree(candidate, blockedAngles, minGap)) {
      return candidate;
    }
  }

  let bestAngle = preferred;
  let bestGap = -1;
  for (let step = 0; step < 72; step++) {
    const candidate = preferred + (step / 72) * Math.PI * 2;
    const gap = blockedAngles.reduce((min, blocked) => {
      const distance = angularDistance(candidate, blocked);
      return min === -1 ? distance : Math.min(min, distance);
    }, -1);
    if (gap > bestGap) {
      bestGap = gap;
      bestAngle = candidate;
    }
  }
  return bestAngle;
}

function placedNodeFromSpec(
  account: NetworkAccount,
  radius: number,
  size: number,
  angle: number,
  center: number
): PlacedNode {
  const unitX = Math.cos(angle);
  const unitY = Math.sin(angle);
  return {
    account,
    x: Math.round(center + unitX * radius),
    y: Math.round(center + unitY * radius),
    size,
    unitX,
    unitY,
  };
}

function placeNetworkNodes(
  accounts: NetworkAccount[],
  stageSize: number
): PlacedNode[] {
  const layout = stageLayoutMetrics(stageSize);
  const specs: Array<{
    account: NetworkAccount;
    radius: number;
    size: number;
  }> = [
    ...accounts
      .filter((a) => a.kind === 'mutual')
      .slice(0, MAX_INNER)
      .map((account) => ({
        account,
        radius: layout.innerRadius,
        size: layout.innerAvatar,
      })),
    ...accounts
      .filter((a) => a.kind === 'incoming')
      .slice(0, MAX_MID)
      .map((account) => ({
        account,
        radius: layout.midRadius,
        size: layout.midAvatar,
      })),
    ...accounts
      .filter((a) => a.kind === 'outgoing')
      .slice(0, MAX_OUTER)
      .map((account) => ({
        account,
        radius: layout.outerRadius,
        size: layout.outerAvatar,
      })),
  ];

  const count = specs.length;
  if (count === 0) return [];

  const globalMinGap = Math.max(
    MIN_SPOKE_ANGLE_RAD,
    (Math.PI * 2) / count + 0.04,
    ...specs.map((spec) => minAngularGapForRing(1, spec.radius, spec.size))
  );

  const usedAngles: number[] = [];
  return specs.map((spec, index) => {
    const preferred = -Math.PI / 2 + (index / count) * Math.PI * 2;
    const angle = findFreeSpokeAngle(preferred, usedAngles, globalMinGap);
    usedAngles.push(angle);
    return placedNodeFromSpec(
      spec.account,
      spec.radius,
      spec.size,
      angle,
      layout.center
    );
  });
}

/** Max radial drift (px at design stage size); scaled down on small orbit avatars. */
const IDLE_FLOAT = 2;
/** Many samples + linear easing ≈ smooth sine drift along each spoke. */
const IDLE_FLOAT_KEYFRAMES = Array.from(
  { length: 13 },
  (_, index) => Math.sin((index / 12) * Math.PI * 2) * IDLE_FLOAT
);
const LINE_EDGE_OVERLAP = 1.5;

function nodeMotion(index: number) {
  return {
    baseDelay: 0.18 + index * 0.022,
    idleDuration: 5.5 + (index % 5) * 0.85,
    idlePhase: (index % 7) * 0.55,
  };
}

function lineCoordinates(node: PlacedNode, layout: StageLayoutMetrics) {
  const startRadius = layout.centerAvatar / 2 - LINE_EDGE_OVERLAP;
  const endRadius = node.size / 2 - LINE_EDGE_OVERLAP;

  return {
    x1: layout.center + node.unitX * startRadius,
    y1: layout.center + node.unitY * startRadius,
    x2: node.x - node.unitX * endRadius,
    y2: node.y - node.unitY * endRadius,
    unitX: node.unitX,
    unitY: node.unitY,
  };
}

function useOrbitFloats(
  nodeCount: number,
  reduceMotion: boolean,
  floatAmplitude: number
) {
  const floatsRef = useRef<MotionValue<number>[]>([]);

  while (floatsRef.current.length < nodeCount) {
    floatsRef.current.push(motionValue(0));
  }
  if (floatsRef.current.length > nodeCount) {
    floatsRef.current.length = nodeCount;
  }

  const floats = floatsRef.current;

  useEffect(() => {
    if (reduceMotion) {
      floats.forEach((value) => value.set(0));
      return undefined;
    }

    const controls = floats.map((yOffset, index) => {
      const { baseDelay, idleDuration, idlePhase } = nodeMotion(index);
      const amplitude = floatAmplitude * (0.88 + (index % 5) * 0.06);
      const keyframes = IDLE_FLOAT_KEYFRAMES.map(
        (value) => (value / IDLE_FLOAT) * amplitude
      );
      return animate(yOffset, keyframes, {
        duration: idleDuration,
        repeat: Infinity,
        ease: 'linear',
        delay: baseDelay + idlePhase,
      });
    });

    return () => controls.forEach((control) => control.stop());
  }, [floatAmplitude, floats, nodeCount, reduceMotion]);

  return floats;
}

function NetworkSpokeLine({
  node,
  layout,
  yOffset,
  isDimmed,
  reduceMotion,
}: {
  node: PlacedNode;
  layout: StageLayoutMetrics;
  yOffset: MotionValue<number>;
  isDimmed: boolean;
  reduceMotion: boolean;
}) {
  const { x1, y1, x2, y2, unitX, unitY } = lineCoordinates(node, layout);
  const driftScale = Math.min(1, node.size / INNER_AVATAR);
  const animatedX2 = useTransform(
    yOffset,
    (offset) => x2 + unitX * offset * driftScale
  );
  const animatedY2 = useTransform(
    yOffset,
    (offset) => y2 + unitY * offset * driftScale
  );
  const isMutual = node.account.kind === 'mutual';
  const targetOpacity = isDimmed ? 0.05 : isMutual ? 0.34 : 0.18;

  return (
    <motion.line
      x1={x1}
      y1={y1}
      x2={animatedX2}
      y2={animatedY2}
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: targetOpacity }}
      exit={reduceMotion ? undefined : { opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.22 }}
      stroke={isMutual ? 'var(--portal-purple)' : 'var(--portal-blue)'}
      strokeWidth={1}
      shapeRendering="geometricPrecision"
      vectorEffect="non-scaling-stroke"
    />
  );
}

function filterCountAccentClass(accent?: NetworkFilterOption['countAccent']) {
  if (accent === 'blue') return 'text-[var(--portal-blue)]';
  if (accent === 'purple') return 'text-[var(--portal-purple)]';
  return '';
}

function NetworkNodeLabel({ children }: { children: string }) {
  return (
    <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-1.5 -translate-x-1/2 max-w-[140px] truncate rounded-md border border-border/45 bg-background/95 px-2 py-0.5 portal-type-caption font-medium text-foreground opacity-0 shadow-sm transition-opacity [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100 group-focus-visible:opacity-100">
      {children}
    </span>
  );
}

function NetworkOrbitNode({
  node,
  index,
  yOffset,
  dimmed,
  reduceMotion,
  pageLayout = false,
  onClose,
  onSelectAccount,
}: {
  node: PlacedNode;
  index: number;
  yOffset: MotionValue<number>;
  dimmed: boolean;
  reduceMotion: boolean;
  pageLayout?: boolean;
  onClose?: () => void;
  onSelectAccount?: (accountId: string) => void;
}) {
  const isMutual = node.account.kind === 'mutual';
  const driftScale = Math.min(1, node.size / INNER_AVATAR);
  const driftX = useTransform(
    yOffset,
    (offset) => offset * node.unitX * driftScale
  );
  const driftY = useTransform(
    yOffset,
    (offset) => offset * node.unitY * driftScale
  );
  const motionTransition = reduceMotion
    ? { duration: 0 }
    : {
        opacity: { duration: 0.22 },
      };

  const nodeClassName = cn(
    'group absolute z-10 touch-manipulation overflow-hidden rounded-full bg-muted/40 transition-[border-color,box-shadow] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--portal-blue-focus-border)] focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    isMutual
      ? 'border-2 border-[var(--portal-purple)]/45 [@media(hover:hover)_and_(pointer:fine)]:hover:border-[var(--portal-purple)] [@media(hover:hover)_and_(pointer:fine)]:hover:shadow-[0_0_12px_color-mix(in_srgb,var(--portal-purple)_22%,transparent)]'
      : 'border-2 border-[var(--portal-blue)]/35 [@media(hover:hover)_and_(pointer:fine)]:hover:border-[var(--portal-blue)] [@media(hover:hover)_and_(pointer:fine)]:hover:shadow-[0_0_12px_color-mix(in_srgb,var(--portal-blue)_20%,transparent)]'
  );
  const nodeStyle = {
    left: node.x,
    top: node.y,
    width: node.size,
    height: node.size,
    marginLeft: -node.size / 2,
    marginTop: -node.size / 2,
    x: driftX,
    y: driftY,
  };
  const avatarInner = node.account.avatarUrl ? (
    <img
      src={node.account.avatarUrl}
      alt=""
      width={node.size}
      height={node.size}
      className="block h-full w-full object-cover object-center select-none pointer-events-none"
      decoding="sync"
      draggable={false}
    />
  ) : (
    <div className="flex h-full w-full items-center justify-center pointer-events-none">
      <User className="h-4 w-4 text-muted-foreground" />
    </div>
  );

  if (pageLayout) {
    return (
      <motion.div
        className={nodeClassName}
        style={nodeStyle}
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: dimmed ? 0.18 : 1 }}
        exit={reduceMotion ? undefined : { opacity: 0 }}
        transition={motionTransition}
      >
        <Link
          href={getPortalProfileUrl(node.account.accountId)}
          prefetch
          onClick={onClose}
          className="block h-full w-full rounded-full"
          aria-label={`Open ${displayLabel(node.account)}`}
        >
          {avatarInner}
        </Link>
        <NetworkNodeLabel>{displayLabel(node.account)}</NetworkNodeLabel>
      </motion.div>
    );
  }

  return (
    <motion.button
      type="button"
      onClick={() => onSelectAccount?.(node.account.accountId)}
      className={nodeClassName}
      style={nodeStyle}
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: dimmed ? 0.18 : 1 }}
      exit={reduceMotion ? undefined : { opacity: 0 }}
      transition={motionTransition}
      aria-label={`Open ${displayLabel(node.account)}`}
    >
      {avatarInner}
      <NetworkNodeLabel>{displayLabel(node.account)}</NetworkNodeLabel>
    </motion.button>
  );
}

function CenterNetworkAccount({
  accountId,
  avatarUrl,
  displayName,
  size = CENTER_AVATAR,
  pageLayout = false,
  onClose,
  onSelectAccount,
}: {
  accountId: string;
  avatarUrl: string | null;
  displayName: string;
  /** Render size in CSS px (unscaled layer keeps avatars sharp). */
  size?: number;
  pageLayout?: boolean;
  onClose?: () => void;
  onSelectAccount?: (accountId: string) => void;
}) {
  const clickable = Boolean(pageLayout || onSelectAccount);
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
        className="pointer-events-none absolute rounded-full"
        style={{
          background: identity.gradient,
          inset: Math.round(-size * 0.52),
        }}
        aria-hidden="true"
      />
      <div className="relative flex h-full w-full shrink-0 items-center justify-center overflow-hidden rounded-full border-[3px] border-[var(--center-identity-border)] bg-muted/40 transition-[border-color,box-shadow] [@media(hover:hover)_and_(pointer:fine)]:hover:border-[var(--center-identity)] [@media(hover:hover)_and_(pointer:fine)]:hover:shadow-[0_0_20px_var(--center-identity-glow-strong)]">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            width={size}
            height={size}
            className="block h-full w-full object-cover object-center"
            decoding="sync"
          />
        ) : (
          <User
            className="shrink-0 text-muted-foreground"
            style={{ width: size * 0.38, height: size * 0.38 }}
          />
        )}
      </div>
      <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-1.5 hidden max-w-[140px] -translate-x-1/2 truncate rounded-md border border-border/45 bg-background/95 px-2 py-0.5 portal-type-caption font-medium text-foreground opacity-0 shadow-sm transition-opacity [@media(hover:hover)_and_(pointer:fine)]:inline [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100">
        {displayName}
      </span>
    </>
  );

  const sharedClassName =
    'group absolute left-1/2 top-1/2 z-30 shrink-0 touch-manipulation rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--center-identity-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-background';
  const sharedStyle: CSSProperties = {
    width: size,
    height: size,
    marginLeft: -size / 2,
    marginTop: -size / 2,
    ...identityStyle,
  };

  if (!clickable) {
    return (
      <div className={sharedClassName} style={sharedStyle}>
        {content}
      </div>
    );
  }

  if (pageLayout) {
    return (
      <Link
        href={getPortalProfileUrl(accountId)}
        prefetch
        onClick={onClose}
        className={cn(sharedClassName, 'cursor-pointer')}
        style={sharedStyle}
        aria-label={`Open ${displayName}`}
      >
        {content}
      </Link>
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
  totalCounts,
  viewerAccountId = null,
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
        <NetworkPanel
          key={sessionKey}
          variant="modal"
          centerAccountId={centerAccountId}
          centerAvatarUrl={centerAvatarUrl}
          centerDisplayName={centerDisplayName}
          accounts={accounts}
          totalCounts={totalCounts}
          viewerAccountId={viewerAccountId}
          isSelf={isSelf}
          onClose={handleClose}
          onSelectAccount={onSelectAccount}
        />
      ) : null}
    </AnimatePresence>,
    document.body
  );
}

export function NetworkPanel({
  variant,
  centerAccountId,
  centerAvatarUrl,
  centerDisplayName,
  accounts,
  totalCounts: totalCountsProp,
  viewerAccountId = null,
  isSelf,
  initialFilter = 'all',
  initialQuery = '',
  syncUrl = false,
  onClose,
  onSelectAccount,
}: NetworkPanelProps) {
  const isPage = variant === 'page';
  const pageLayout = isPage;
  const reduceMotion = useReducedMotion();
  const scrollRef = useRef<HTMLDivElement>(null);
  const latestSearchLoadRef = useRef(0);
  const {
    isOpen: filterMenuOpen,
    close: closeFilterMenu,
    toggle: toggleFilterMenu,
    containerRef: filterMenuRef,
  } = useDropdown();
  const [filter, setFilter] = useState<FilterKind>(initialFilter);
  const [query, setQuery] = useState(initialQuery);
  const [displayAccounts, setDisplayAccounts] = useState(accounts);
  const [searchMeta, setSearchMeta] =
    useState<PortalProfileNetworkSearchMeta | null>(null);
  const [searchFetching, setSearchFetching] = useState(false);
  const [stageSize, setStageSize] = useState(STAGE_SIZE);
  useBodyScrollLock(!isPage, scrollRef);

  const normalizedSearchQuery = normalizeProfileSearchQuery(query);
  const serverSearchActive = isProfileSearchQuery(normalizedSearchQuery);

  useEffect(() => {
    setFilter(initialFilter);
  }, [initialFilter]);

  useEffect(() => {
    if (!serverSearchActive) {
      setDisplayAccounts(accounts);
      setSearchMeta(null);
      setSearchFetching(false);
    }
  }, [accounts, serverSearchActive]);

  useEffect(() => {
    if (!serverSearchActive) return;

    const loadId = latestSearchLoadRef.current + 1;
    latestSearchLoadRef.current = loadId;
    setSearchFetching(true);
    const controller = new AbortController();
    let fetchStarted = false;

    const timeout = window.setTimeout(() => {
      fetchStarted = true;
      void fetchPortalProfileNetwork(
        {
          accountId: centerAccountId,
          viewerAccountId,
          searchQuery: normalizedSearchQuery,
          filter: filter as PortalNetworkFilter,
        },
        {
          signal: controller.signal,
          onRevalidate: (result) => {
            if (latestSearchLoadRef.current !== loadId) return;
            setDisplayAccounts(result.accounts);
            setSearchMeta(result.search);
          },
        }
      )
        .then((result) => {
          if (latestSearchLoadRef.current !== loadId) return;
          setDisplayAccounts(result.accounts);
          setSearchMeta(result.search);
        })
        .catch((error) => {
          if (latestSearchLoadRef.current !== loadId) return;
          if (isAbortLikeError(error, controller.signal)) return;
          setSearchMeta(null);
        })
        .finally(() => {
          if (latestSearchLoadRef.current === loadId) {
            setSearchFetching(false);
          }
        });
    }, 220);

    return () => {
      window.clearTimeout(timeout);
      if (fetchStarted) controller.abort();
    };
  }, [
    centerAccountId,
    filter,
    normalizedSearchQuery,
    serverSearchActive,
    viewerAccountId,
  ]);

  useEffect(() => {
    if (!syncUrl || !isPage) return;

    syncPortalNetworkUrl(centerAccountId, {
      filter: filter as PortalNetworkFilter,
      q: serverSearchActive ? normalizedSearchQuery : null,
    });
  }, [
    centerAccountId,
    filter,
    isPage,
    normalizedSearchQuery,
    serverSearchActive,
    syncUrl,
  ]);

  useEffect(() => {
    const updateStageSize = () => {
      const isNarrow = window.innerWidth < 640;
      const viewportPadding = isNarrow ? 48 : 96;
      const availableWidth = Math.max(
        MIN_STAGE_SIZE,
        window.innerWidth - viewportPadding
      );
      let nextSize = Math.min(STAGE_SIZE, availableWidth);

      if (isPage) {
        const reservedHeight = isNarrow ? 228 : 208;
        const availableHeight = Math.max(
          MIN_STAGE_SIZE,
          window.innerHeight - reservedHeight
        );
        nextSize = Math.min(nextSize, availableHeight);
      }

      setStageSize(nextSize);
    };

    updateStageSize();
    window.addEventListener('resize', updateStageSize);
    return () => window.removeEventListener('resize', updateStageSize);
  }, [isPage]);

  useEffect(() => {
    if (!onClose) return;
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

  const sampleCounts = useMemo(() => {
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

  const totalCounts = totalCountsProp ?? sampleCounts;
  const filterCounts = networkFilterCounts(totalCounts);
  const totalUnique = networkUniqueConnectionTotal(totalCounts);

  const stageLayout = useMemo(() => stageLayoutMetrics(stageSize), [stageSize]);
  const placedNodes: PlacedNode[] = useMemo(
    () => placeNetworkNodes(displayAccounts, stageSize),
    [displayAccounts, stageSize]
  );
  const mapShownCount = placedNodes.length;
  const searchMatchTotal = searchMeta?.matchTotal ?? 0;
  const showSearchCaption =
    serverSearchActive && !searchFetching && searchMatchTotal > mapShownCount;
  const showPreviewCaption = !serverSearchActive && totalUnique > mapShownCount;
  const orbitFloats = useOrbitFloats(
    placedNodes.length,
    Boolean(reduceMotion),
    stageLayout.floatAmplitude
  );
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
  const isDimmed = (account: NetworkAccount): boolean => {
    if (!matchesFilter(account)) return true;
    if (!serverSearchActive && !matchesQuery(account)) return true;
    return false;
  };

  const networkMeta =
    totalUnique === 0
      ? 'NO CONNECTIONS YET'
      : `${formatProfileCount(totalUnique)} ${
          totalUnique === 1 ? 'CONNECTION' : 'CONNECTIONS'
        }`;

  const filterOptions: NetworkFilterOption[] = [
    { id: 'all', label: 'All', count: filterCounts.all },
    {
      id: 'mutual',
      label: 'Solidarity',
      count: filterCounts.mutual,
      countAccent: 'purple',
    },
    {
      id: 'incoming',
      label: isSelf ? 'Stand with you' : 'Stand with them',
      count: filterCounts.incoming,
      countAccent: 'blue',
    },
    {
      id: 'outgoing',
      label: isSelf ? 'You stand with' : 'They stand with',
      count: filterCounts.outgoing,
      countAccent: 'blue',
    },
  ];

  const viewAllStandKind: PortalStandKind = networkFilterToStandKind(filter);
  const viewAllHref = getPortalStandUrl(centerAccountId, viewAllStandKind, {
    q: serverSearchActive ? normalizedSearchQuery : null,
  });
  const activeFilterOption =
    filterOptions.find((option) => option.id === filter) ?? filterOptions[0];
  const centerAvatarSize = stageLayout.centerAvatar;
  const title = isSelf ? 'Your network' : `${centerDisplayName}'s network`;

  const panelBody = (
    <>
      {!isPage ? (
        <ModalHeader
          titleId="network-modal-title"
          title={title}
          description={networkMeta}
          descriptionVariant="meta"
          actions={
            onClose ? (
              <ModalCloseButton ariaLabel="Close network" onClick={onClose} />
            ) : null
          }
        />
      ) : null}

      <div
        className={cn(
          'shrink-0 space-y-3',
          isPage ? 'px-4 pb-2 md:px-5' : 'px-5 pb-3'
        )}
      >
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
                    'inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full border border-border/35 bg-background/55 px-1 portal-type-caption font-semibold tabular-nums leading-none text-muted-foreground/90',
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
                <p className="mb-0.5 whitespace-nowrap portal-type-label text-muted-foreground/70">
                  Relationship
                </p>
                <p className="whitespace-nowrap portal-type-body font-medium text-foreground">
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
                          'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border portal-type-caption font-semibold tabular-nums leading-none transition-colors',
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
            placeholder="Search standings"
            size="sm"
            maxLength={80}
            containerClassName="min-w-0 flex-1"
            clearAriaLabel="Clear network search"
          />
        </div>

        {serverSearchActive && searchFetching ? (
          <p className="portal-type-label text-muted-foreground/50">
            Searching standings…
          </p>
        ) : showSearchCaption ? (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
            <p className="min-w-0 portal-type-label text-muted-foreground/55">
              Map shows {formatProfileCount(mapShownCount)} of{' '}
              {formatProfileCount(searchMatchTotal)} matches
            </p>
            <Link
              href={viewAllHref}
              className="shrink-0 portal-type-label font-medium text-[var(--portal-blue)] transition-colors hover:text-[var(--portal-blue)]/80"
            >
              View all
            </Link>
          </div>
        ) : showPreviewCaption ? (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
            <p className="min-w-0 portal-type-label text-muted-foreground/55">
              Map shows {formatProfileCount(mapShownCount)} of{' '}
              {formatProfileCount(totalUnique)} · newest stands
            </p>
            <Link
              href={viewAllHref}
              className="shrink-0 portal-type-label font-medium text-[var(--portal-blue)] transition-colors hover:text-[var(--portal-blue)]/80"
            >
              View all
            </Link>
          </div>
        ) : totalUnique > 0 ? (
          <div className="flex justify-end">
            <Link
              href={viewAllHref}
              className="portal-type-label font-medium text-[var(--portal-blue)] transition-colors hover:text-[var(--portal-blue)]/80"
            >
              View all
            </Link>
          </div>
        ) : null}
      </div>

      <div
        ref={scrollRef}
        className={cn(
          'relative min-h-0 flex-1 overflow-hidden',
          isPage && 'flex items-center justify-center'
        )}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at 50% 50%, hsl(var(--foreground) / 0.05), transparent 70%)',
          }}
        />

        <div className="absolute inset-0 flex items-center justify-center overflow-visible max-md:overflow-hidden">
          <div
            className="relative"
            style={{ width: stageSize, height: stageSize }}
          >
            <div
              className={cn(
                'absolute left-1/2 top-1/2 transition-opacity duration-300',
                serverSearchActive && searchFetching && 'opacity-[0.68]'
              )}
              style={{
                width: stageSize,
                height: stageSize,
                marginLeft: -stageSize / 2,
                marginTop: -stageSize / 2,
              }}
            >
              <svg
                className="pointer-events-none absolute inset-0 z-0 [shape-rendering:geometricPrecision]"
                width={stageSize}
                height={stageSize}
                viewBox={`0 0 ${stageSize} ${stageSize}`}
                aria-hidden="true"
              >
                <AnimatePresence mode="sync">
                  {placedNodes.map((node, index) => (
                    <NetworkSpokeLine
                      key={`line-${node.account.accountId}`}
                      node={node}
                      layout={stageLayout}
                      yOffset={orbitFloats[index]}
                      isDimmed={isDimmed(node.account)}
                      reduceMotion={Boolean(reduceMotion)}
                    />
                  ))}
                </AnimatePresence>
              </svg>

              <AnimatePresence mode="sync">
                {placedNodes.map((node, index) => (
                  <NetworkOrbitNode
                    key={node.account.accountId}
                    node={node}
                    index={index}
                    yOffset={orbitFloats[index]}
                    dimmed={isDimmed(node.account)}
                    reduceMotion={Boolean(reduceMotion)}
                    pageLayout={pageLayout}
                    onClose={onClose}
                    onSelectAccount={onSelectAccount}
                  />
                ))}
              </AnimatePresence>
            </div>

            <CenterNetworkAccount
              accountId={centerAccountId}
              avatarUrl={centerAvatarUrl}
              displayName={centerDisplayName}
              size={centerAvatarSize}
              pageLayout={pageLayout}
              onClose={onClose}
              onSelectAccount={onSelectAccount}
            />
          </div>
        </div>

        {!searchFetching &&
        (serverSearchActive
          ? searchMatchTotal === 0
          : displayAccounts.length === 0) ? (
          <div className="absolute inset-x-0 bottom-12 px-6 text-center portal-type-body-sm text-muted-foreground/55">
            {serverSearchActive
              ? 'No standings match your search.'
              : isSelf
                ? 'No standing connections yet. Stand with someone to start your network.'
                : `${centerDisplayName} has no standing connections yet.`}
          </div>
        ) : null}
      </div>
    </>
  );

  if (isPage) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col md:max-h-[calc(100dvh-11.25rem)]">
        {panelBody}
      </div>
    );
  }

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
        {panelBody}
      </motion.div>
    </motion.div>
  );
}
