'use client';

import Link from 'next/link';
import type { CSSProperties, MouseEvent } from 'react';
import { UserIcon } from '@onsocial/ui';
import { useNetworkOrbit } from '@/components/panels/network-orbit-context';
import { useOpenNetworkStandingList } from '@/components/panels/network-orbit-sheet-header';
import { displayName as resolveDisplayName } from '@/lib/profile-display';
import {
  ORBIT_SPARSE_LABEL_LIMIT,
  orbitCenterIdentity,
  orbitLabelShiftX,
  orbitStageLayout,
  type OrbitPlacedNode,
} from '@/lib/profile-network-layout';
import { formatProfileCount } from '@/lib/profile-social-standings';
import { networkPath, portfolioPath } from '@/lib/overlay-routes';
import type { NetworkAccount } from '@/lib/profile-network';

const LINE_EDGE_OVERLAP = 1.5;

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
  const base =
    orbitStageLayout(stageSize).floatAmplitude * (0.88 + (index % 5) * 0.06);
  const driftScale = Math.min(1, node.size / 40);
  return base * driftScale;
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
  const radius = Math.hypot(node.x - layout.center, node.y - layout.center);
  const startRadius = layout.centerAvatar / 2 - LINE_EDGE_OVERLAP;
  const endRadius = node.size / 2 - LINE_EDGE_OVERLAP;
  const length = Math.max(0, radius - startRadius - endRadius);
  const motion = nodeMotion(index);
  const amp = nodeDrift(node, index, stageSize);

  return (
    <div
      className="network-orbit-spoke"
      style={{
        left: cssPx(layout.center),
        top: cssPx(layout.center),
        transform: `rotate(${cssRad(angle)})`,
        animationDelay: `${motion.entranceDelay}s`,
      }}
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
            left: cssPx(startRadius),
            width: cssPx(length),
            '--orbit-amp': cssPx(amp),
            animationDelay: `${motion.idleDelay}s`,
            animationDuration: `${motion.idleDuration}s`,
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
  const { stageInsetX, displayName, isSelf, openSubject } = useNetworkOrbit();
  const motion = nodeMotion(index);
  const amp = nodeDrift(node, index, stageSize);
  const label = nodeLabel(node.account);
  const labelShiftX = orbitLabelShiftX({
    x: node.x,
    stageSize,
    stageInsetX,
    label,
  });
  const endorsed = node.account.endorsed === true;

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
      className={`network-orbit-node${
        node.account.kind === 'mutual' ? ' network-orbit-node--mutual' : ''
      }${dimmed ? ' is-dimmed' : ''}`}
      style={
        {
          left: cssPx(node.x),
          top: cssPx(node.y),
          width: cssPx(node.size),
          height: cssPx(node.size),
          marginLeft: cssPx(-node.size / 2),
          marginTop: cssPx(-node.size / 2),
          '--orbit-fx': cssPx(node.unitX * amp),
          '--orbit-fy': cssPx(node.unitY * amp),
          '--label-shift-x': cssPx(labelShiftX),
          animationDelay: `${motion.entranceDelay}s, ${motion.idleDelay}s`,
          animationDuration: `0.22s, ${motion.idleDuration}s`,
        } as CSSProperties
      }
      aria-label={`Open ${label}'s network${
        endorsed ? `, endorsed by ${isSelf ? 'you' : displayName}` : ''
      }`}
    >
      {node.account.avatarUrl ? (
        <img
          src={node.account.avatarUrl}
          alt=""
          width={node.size}
          height={node.size}
          className="network-orbit-node-avatar"
          draggable={false}
        />
      ) : (
        <span className="network-orbit-node-fallback" aria-hidden>
          <UserIcon className="network-orbit-node-fallback-icon" />
        </span>
      )}
      {endorsed ? (
        <span className="network-orbit-node-endorsed" aria-hidden="true" />
      ) : null}
      <span className="network-orbit-node-label">{label}</span>
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
        width: cssPx(size),
        height: cssPx(size),
        marginLeft: cssPx(-size / 2),
        marginTop: cssPx(-size / 2),
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
          <img src={avatarUrl} alt="" width={size} height={size} />
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
      <span className="network-orbit-center-label">{displayName}</span>
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
    !ringsFading &&
    !loading &&
    !loadError &&
    !searchFetching &&
    (searchActive ? searchMatchTotal === 0 : placedNodes.length === 0);
  const sparse =
    placedNodes.length > 0 && placedNodes.length <= ORBIT_SPARSE_LABEL_LIMIT;

  return (
    <div className="network-orbit-panel">
      <OrbitCaptions />

      <div className="network-orbit-stage-wrap" ref={stageWrapRef}>
        <div className="network-orbit-stage-bg" aria-hidden="true" />
        <div
          className={`network-orbit-stage${
            sparse ? ' network-orbit-stage--sparse' : ''
          }${ringsFading ? ' is-fading-rings' : ''}${
            (searchActive && searchFetching) || personalizing
              ? ' is-refreshing'
              : ''
          }`}
          style={{ width: cssPx(stageSize), height: cssPx(stageSize) }}
        >
          {placedNodes.map((node, index) => (
            <OrbitSpoke
              key={`spoke-${node.account.accountId}`}
              node={node}
              index={index}
              dimmed={isDimmed(node.account)}
              stageSize={stageSize}
            />
          ))}
          {placedNodes.map((node, index) => (
            <OrbitNode
              key={node.account.accountId}
              node={node}
              index={index}
              dimmed={isDimmed(node.account)}
              stageSize={stageSize}
            />
          ))}
          <OrbitCenter stageSize={stageSize} />
        </div>

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
