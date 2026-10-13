'use client';

import Link from 'next/link';
import type { CSSProperties, MouseEvent } from 'react';
import { UserIcon } from '@onsocial/ui';
import { useNetworkOrbit } from '@/components/panels/network-orbit-context';
import { useOpenNetworkStandingList } from '@/components/panels/network-orbit-sheet-header';
import { displayName as resolveDisplayName } from '@/lib/profile-display';
import {
  orbitCenterIdentity,
  orbitLabelOffset,
  orbitNodeDrift,
  orbitSpokeJoin,
  orbitStageLayout,
  ORBIT_ENDORSED_LABEL_HEIGHT_PX,
  type OrbitPlacedNode,
} from '@/lib/profile-network-layout';
import { formatProfileCount } from '@/lib/profile-social-standings';
import { networkPath, portfolioPath } from '@/lib/overlay-routes';
import type { NetworkAccount } from '@/lib/profile-network';

/**
 * SSR prints `230px` and the browser shortens long floats. The client then
 * hydrates a different style string and drops click handlers on the map.
 * Round first so both sides emit the same text.
 */
function cssPx(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${Object.is(rounded, -0) ? 0 : rounded}px`;
}

function cssRad(value: number): string {
  const rounded = Math.round(value * 1e5) / 1e5;
  return `${Object.is(rounded, -0) ? 0 : rounded}rad`;
}

function nodeLabel(account: NetworkAccount): string {
  return account.name?.trim() || resolveDisplayName(account.accountId);
}

function nodeMotion(index: number) {
  return {
    entranceDelay: 0.18 + index * 0.022,
    idleDuration: 5.5 + (index % 5) * 0.85,
    idleDelay: 0.18 + index * 0.022 + (index % 7) * 0.55,
  };
}

function nodeDrift(
  node: OrbitPlacedNode,
  index: number,
  stageSize: number
): number {
  return orbitNodeDrift(stageSize, node.size, index);
}

/** Hold the glide where it is so the name stays put, then let it resume. */
function idleMotion(el: Element): CSSAnimation | null {
  for (const anim of el.getAnimations()) {
    if (
      anim instanceof CSSAnimation &&
      (anim.animationName === 'network-orbit-idle-node' ||
        anim.animationName === 'network-orbit-idle-line')
    ) {
      return anim;
    }
  }
  return null;
}

function settleSeat(seat: Element, held: boolean) {
  for (const el of seat.querySelectorAll(
    '.network-orbit-node, .network-orbit-spoke-line'
  )) {
    const idle = idleMotion(el);
    if (!idle) continue;
    if (held) {
      idle.pause();
    } else if (idle.playState === 'paused') {
      idle.play();
    }
  }
}

function OrbitSpoke({
  node,
  index,
  dimmed,
  stageSize,
}: {
  node: OrbitPlacedNode;
  index: number;
  dimmed: boolean;
  stageSize: number;
}) {
  const layout = orbitStageLayout(stageSize);
  const angle = Math.atan2(node.unitY, node.unitX);
  const motion = nodeMotion(index);
  const join = orbitSpokeJoin({
    nodeX: node.x,
    nodeY: node.y,
    nodeSize: node.size,
    unitX: node.unitX,
    unitY: node.unitY,
    center: layout.center,
    centerRadius: layout.centerAvatar / 2,
    amplitude: nodeDrift(node, index, stageSize),
  });

  return (
    <div
      className="network-orbit-spoke"
      style={
        {
          left: cssPx(layout.center),
          top: cssPx(layout.center),
          transform: `rotate(${cssRad(angle)})`,
          '--enter-delay': `${motion.entranceDelay}s`,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      <div
        className={`network-orbit-spoke-line${
          node.account.kind === 'mutual'
            ? ' network-orbit-spoke-line--mutual'
            : ''
        }${dimmed ? ' is-dimmed' : ''}`}
        style={
          {
            left: cssPx(join.start),
            width: cssPx(join.length),
            '--orbit-amp': cssPx(join.amp),
            '--idle-delay': `${motion.idleDelay}s`,
            '--idle-duration': `${motion.idleDuration}s`,
          } as CSSProperties
        }
      />
    </div>
  );
}

function OrbitNode({
  node,
  index,
  dimmed,
  stageSize,
}: {
  node: OrbitPlacedNode;
  index: number;
  dimmed: boolean;
  stageSize: number;
}) {
  const {
    stageInsetX,
    stageInsetY,
    displayName,
    isSelf,
    openSubject,
    placedNodes,
  } = useNetworkOrbit();
  const motion = nodeMotion(index);
  const label = nodeLabel(node.account);
  const layout = orbitStageLayout(stageSize);
  const join = orbitSpokeJoin({
    nodeX: node.x,
    nodeY: node.y,
    nodeSize: node.size,
    unitX: node.unitX,
    unitY: node.unitY,
    center: layout.center,
    centerRadius: layout.centerAvatar / 2,
    amplitude: nodeDrift(node, index, stageSize),
  });
  const endorsed = node.account.endorsed === true;
  const labelOffset = orbitLabelOffset({
    x: node.x,
    y: node.y,
    size: node.size,
    unitX: node.unitX,
    unitY: node.unitY,
    stageSize,
    stageInsetX,
    stageInsetY,
    label: endorsed && label.length < 'Endorsed'.length ? 'Endorsed' : label,
    labelHeight: endorsed ? ORBIT_ENDORSED_LABEL_HEIGHT_PX : undefined,
    obstacles: [
      {
        x: layout.center,
        y: layout.center,
        radius: layout.centerAvatar / 2,
      },
      ...placedNodes
        .filter((other) => other.account.accountId !== node.account.accountId)
        .map((other) => ({
          x: other.x,
          y: other.y,
          radius: other.size / 2,
        })),
    ],
  });

  const settleHere = (event: {
    currentTarget: EventTarget & HTMLAnchorElement;
  }) => {
    const seat = event.currentTarget.closest('.network-orbit-seat');
    if (!seat) return;
    settleSeat(seat, event.currentTarget.matches(':hover, :focus-visible'));
  };

  const openHere = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) {
      return;
    }
    event.preventDefault();
    openSubject(node.account);
  };

  return (
    <Link
      href={networkPath(node.account.accountId)}
      scroll={false}
      onClick={openHere}
      onPointerEnter={settleHere}
      onPointerLeave={settleHere}
      onFocus={settleHere}
      onBlur={settleHere}
      className={`network-orbit-node${
        node.account.kind === 'mutual' ? ' network-orbit-node--mutual' : ''
      }${dimmed ? ' is-dimmed' : ''}`}
      style={
        {
          left: cssPx(Math.round(node.x - node.size / 2)),
          top: cssPx(Math.round(node.y - node.size / 2)),
          width: cssPx(node.size),
          height: cssPx(node.size),
          '--orbit-fx': cssPx(join.driftX),
          '--orbit-fy': cssPx(join.driftY),
          '--label-x': cssPx(labelOffset.x),
          '--label-y': cssPx(labelOffset.y),
          '--enter-delay': `${motion.entranceDelay}s`,
          '--idle-delay': `${motion.idleDelay}s`,
          '--idle-duration': `${motion.idleDuration}s`,
        } as CSSProperties
      }
      aria-label={`Open ${label}'s network${
        endorsed ? `, endorsed by ${isSelf ? 'you' : displayName}` : ''
      }`}
    >
      <span className="network-orbit-node-face">
        {node.account.avatarUrl ? (
          <img
            src={node.account.avatarUrl}
            alt=""
            className="network-orbit-node-avatar"
            draggable={false}
          />
        ) : (
          <span className="network-orbit-node-fallback" aria-hidden>
            <UserIcon className="network-orbit-node-fallback-icon" />
          </span>
        )}
      </span>
      <span className="network-orbit-node-ring" aria-hidden="true" />
      {endorsed ? (
        <span className="network-orbit-node-endorsed" aria-hidden="true" />
      ) : null}
      <span className="network-orbit-node-label">
        <span className="network-orbit-node-label-name">{label}</span>
        {endorsed ? (
          <span className="network-orbit-node-label-mark">Endorsed</span>
        ) : null}
      </span>
    </Link>
  );
}

function OrbitCenter({ stageSize }: { stageSize: number }) {
  const { accountId, displayName, avatarUrl, centerMood } = useNetworkOrbit();
  const layout = orbitStageLayout(stageSize);
  const size = layout.centerAvatar;
  const identity = orbitCenterIdentity(accountId);

  const identityVars: CSSProperties = centerMood
    ? ({
        '--center-identity': centerMood.accent,
        '--center-identity-border': `color-mix(in srgb, ${centerMood.accent} 55%, transparent)`,
        '--center-identity-glow': `color-mix(in srgb, ${centerMood.accent} 30%, transparent)`,
      } as CSSProperties)
    : ({
        '--center-identity': `hsl(${identity.primaryHue} 60% 60%)`,
        '--center-identity-border': `hsl(${identity.primaryHue} 60% 60% / 0.55)`,
        '--center-identity-glow': `hsl(${identity.primaryHue} 60% 60% / 0.3)`,
      } as CSSProperties);
  const glowBackground = centerMood
    ? `radial-gradient(circle, color-mix(in srgb, ${centerMood.accent} 32%, transparent), color-mix(in srgb, ${centerMood.accentLight} 14%, transparent), transparent 70%)`
    : identity.gradient;

  return (
    <Link
      href={portfolioPath(accountId)}
      className="network-orbit-center"
      style={{
        left: cssPx(Math.round(layout.center - size / 2)),
        top: cssPx(Math.round(layout.center - size / 2)),
        width: cssPx(size),
        height: cssPx(size),
        ...identityVars,
      }}
      aria-label={`Open ${displayName}`}
    >
      <span
        className="network-orbit-center-glow"
        style={{
          background: glowBackground,
          inset: cssPx(Math.round(-size * 0.52)),
        }}
        aria-hidden="true"
      />
      <span className="network-orbit-center-avatar">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" />
        ) : (
          <span
            className="network-orbit-center-fallback-icon"
            style={{ width: cssPx(size * 0.38), height: cssPx(size * 0.38) }}
            aria-hidden
          >
            <UserIcon className="network-orbit-center-fallback-glyph" />
          </span>
        )}
      </span>
      <span className="network-orbit-center-ring" aria-hidden="true" />
    </Link>
  );
}

function OrbitCaptions() {
  const {
    searchActive,
    searchFetching,
    searchMatchTotal,
    mapShownCount,
    totalUnique,
    viewerKnownCount,
    subjectEndorsedCount,
    isSelf,
    listHref,
  } = useNetworkOrbit();
  const openStandingList = useOpenNetworkStandingList();

  if (searchActive && searchFetching) {
    return (
      <div className="network-orbit-caption-row">
        <p className="network-orbit-caption">Searching…</p>
      </div>
    );
  }

  if (searchActive && searchMatchTotal > mapShownCount) {
    return (
      <div className="network-orbit-caption-row">
        <p className="network-orbit-caption">
          Map shows {formatProfileCount(mapShownCount)} of{' '}
          {formatProfileCount(searchMatchTotal)} matches
        </p>
        <Link
          href={listHref}
          scroll={false}
          prefetch={false}
          className="network-orbit-view-all"
          onClick={openStandingList}
        >
          View all
        </Link>
      </div>
    );
  }

  if (!searchActive && totalUnique > mapShownCount) {
    const personalized = viewerKnownCount > 0 && !isSelf;
    const endorsed = subjectEndorsedCount > 0;
    const order = personalized
      ? endorsed
        ? 'people you know + endorsed first'
        : 'people you know + newest'
      : endorsed
        ? 'endorsed + newest'
        : 'newest stands';
    return (
      <div className="network-orbit-caption-row">
        <p className="network-orbit-caption">
          Map shows {formatProfileCount(mapShownCount)} of{' '}
          {formatProfileCount(totalUnique)} · {order}
        </p>
        <Link
          href={listHref}
          scroll={false}
          prefetch={false}
          className="network-orbit-view-all"
          onClick={openStandingList}
        >
          View all
        </Link>
      </div>
    );
  }

  if (totalUnique > 0) {
    return (
      <div className="network-orbit-caption-row network-orbit-caption-row--end">
        <Link
          href={listHref}
          scroll={false}
          prefetch={false}
          className="network-orbit-view-all"
          onClick={openStandingList}
        >
          View all
        </Link>
      </div>
    );
  }

  return <div className="network-orbit-caption-row" aria-hidden="true" />;
}

export function NetworkOrbitContent() {
  const {
    placedNodes,
    stageSize,
    stageWrapRef,
    isDimmed,
    searchActive,
    searchFetching,
    searchMatchTotal,
    loading,
    loadError,
    isSelf,
    displayName,
    personalizing,
    ringsFading,
  } = useNetworkOrbit();

  const showEmpty =
    stageSize != null &&
    !ringsFading &&
    !loading &&
    !loadError &&
    !searchFetching &&
    (searchActive ? searchMatchTotal === 0 : placedNodes.length === 0);
  return (
    <div className="network-orbit-panel">
      <OrbitCaptions />

      <div className="network-orbit-stage-wrap" ref={stageWrapRef}>
        <div className="network-orbit-stage-bg" aria-hidden="true" />
        {stageSize != null ? (
          <div
            className={`network-orbit-stage${
              ringsFading ? ' is-fading-rings' : ''
            }${
              (searchActive && searchFetching) || personalizing
                ? ' is-refreshing'
                : ''
            }`}
            style={{ width: cssPx(stageSize), height: cssPx(stageSize) }}
          >
            {placedNodes.map((node, index) => (
              <div className="network-orbit-seat" key={node.account.accountId}>
                <OrbitSpoke
                  node={node}
                  index={index}
                  dimmed={isDimmed(node.account)}
                  stageSize={stageSize}
                />
                <OrbitNode
                  node={node}
                  index={index}
                  dimmed={isDimmed(node.account)}
                  stageSize={stageSize}
                />
              </div>
            ))}
            <OrbitCenter stageSize={stageSize} />
          </div>
        ) : null}

        {loadError ? (
          <p className="network-orbit-empty">{loadError}</p>
        ) : showEmpty ? (
          <p className="network-orbit-empty">
            {searchActive
              ? 'No standings match your search.'
              : isSelf
                ? 'No standing connections yet. Stand with someone to start your network.'
                : `${displayName} has no standing connections yet.`}
          </p>
        ) : null}
      </div>
    </div>
  );
}
