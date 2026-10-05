import {
  NETWORK_GRAPH_RING_CAP,
  type NetworkAccount,
} from '@/lib/profile-network';

export const ORBIT_STAGE_SIZE = 460;
export const ORBIT_MIN_STAGE_SIZE = 260;

const INNER_RADIUS = 108;
const MID_RADIUS = 146;
const OUTER_RADIUS = 184;
const CENTER_AVATAR = 84;
const INNER_AVATAR = 40;
const MID_AVATAR = 34;
const OUTER_AVATAR = 30;
/** Minimum angle between any two spokes (global, all rings). */
const MIN_SPOKE_ANGLE_RAD = 0.34;
const GOLDEN_ANGLE_RAD = 2.399963229728653;
const NODE_RING_PADDING_PX = 10;
/** Max radial drift (px at design stage size); scaled down on small stages. */
export const ORBIT_IDLE_FLOAT = 2;

export interface OrbitStageLayout {
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

export function orbitStageLayout(stageSize: number): OrbitStageLayout {
  const scale = stageSize / ORBIT_STAGE_SIZE;
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
    floatAmplitude: ORBIT_IDLE_FLOAT * scale,
  };
}

export interface OrbitPlacedNode {
  account: NetworkAccount;
  x: number;
  y: number;
  size: number;
  unitX: number;
  unitY: number;
  ring: 'inner' | 'mid' | 'outer';
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

/**
 * Place orbit nodes on three rings — mutual inner, incoming mid, outgoing
 * outer — spreading spokes so no two avatars overlap. Deterministic per
 * account list, so server and client render the same map.
 */
export function placeNetworkNodes(
  accounts: NetworkAccount[],
  stageSize: number
): OrbitPlacedNode[] {
  const layout = orbitStageLayout(stageSize);
  const specs: Array<{
    account: NetworkAccount;
    radius: number;
    size: number;
    ring: OrbitPlacedNode['ring'];
  }> = [
    ...accounts
      .filter((a) => a.kind === 'mutual')
      .slice(0, NETWORK_GRAPH_RING_CAP.mutual)
      .map((account) => ({
        account,
        radius: layout.innerRadius,
        size: layout.innerAvatar,
        ring: 'inner' as const,
      })),
    ...accounts
      .filter((a) => a.kind === 'incoming')
      .slice(0, NETWORK_GRAPH_RING_CAP.incoming)
      .map((account) => ({
        account,
        radius: layout.midRadius,
        size: layout.midAvatar,
        ring: 'mid' as const,
      })),
    ...accounts
      .filter((a) => a.kind === 'outgoing')
      .slice(0, NETWORK_GRAPH_RING_CAP.outgoing)
      .map((account) => ({
        account,
        radius: layout.outerRadius,
        size: layout.outerAvatar,
        ring: 'outer' as const,
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
    const unitX = Math.cos(angle);
    const unitY = Math.sin(angle);
    return {
      account: spec.account,
      x: Math.round(layout.center + unitX * spec.radius),
      y: Math.round(layout.center + unitY * spec.radius),
      size: spec.size,
      unitX,
      unitY,
      ring: spec.ring,
    };
  });
}

export function orbitAccountHash(accountId: string): number {
  let hash = 0;
  for (let i = 0; i < accountId.length; i++) {
    hash = ((hash << 5) - hash + accountId.charCodeAt(i)) | 0;
  }
  return hash;
}

/** Stable identity hue + glow gradient for the center account. */
export function orbitCenterIdentity(accountId: string): {
  primaryHue: number;
  gradient: string;
} {
  const hash = orbitAccountHash(accountId);
  const primaryHue = Math.abs(hash % 360);
  const secondaryHue = (primaryHue + 40 + Math.abs((hash >> 8) % 30)) % 360;
  return {
    primaryHue,
    gradient: `radial-gradient(circle, hsl(${primaryHue} 60% 60% / 0.32), hsl(${secondaryHue} 45% 55% / 0.14), transparent 70%)`,
  };
}
