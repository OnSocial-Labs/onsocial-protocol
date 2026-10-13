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
const NODE_RING_PADDING_PX = 10;
/** Air a farther spoke keeps from a closer face, at the design stage size. */
const SPOKE_AIR_PX = 8;
/** Max radial drift (px at design stage size); scaled with the stage. */
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

/**
 * Stage square for the space the map can use. Grows with that space —
 * a full screen stays larger than a smaller window — and only floors
 * when the wrap is tighter than the smallest readable ring.
 */
export function orbitFitStageSize(width: number, height: number): number {
  const pad = 24;
  const room = Math.min(width, height) - pad;
  if (!Number.isFinite(room)) return ORBIT_STAGE_SIZE;
  return Math.max(ORBIT_MIN_STAGE_SIZE, Math.round(room));
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

/** Per-node drift phase. Index 4 is the widest breathe. */
export function orbitDriftPhase(index: number): number {
  return 0.88 + (index % 5) * 0.06;
}

/** How far a spoke tucks under a ring so the join stays hidden. */
export const SPOKE_RING_TUCK_PX = 1.5;

/**
 * The face and its line ease outward together.
 * The line meets the face ring, and the center end stays covered
 * because that end is tucked by the same distance the line will travel.
 */
export function orbitSpokeJoin(input: {
  nodeX: number;
  nodeY: number;
  nodeSize: number;
  unitX: number;
  unitY: number;
  center: number;
  centerRadius: number;
  amplitude: number;
}): {
  driftX: number;
  driftY: number;
  amp: number;
  start: number;
  length: number;
} {
  const radius = Math.hypot(
    input.nodeX - input.center,
    input.nodeY - input.center
  );
  const driftX = Math.round(input.unitX * input.amplitude);
  const driftY = Math.round(input.unitY * input.amplitude);
  const amp = driftX * input.unitX + driftY * input.unitY;
  const start = input.centerRadius - SPOKE_RING_TUCK_PX - amp;
  const end = input.nodeSize / 2 - SPOKE_RING_TUCK_PX;
  const length = Math.max(0, radius - start - end);
  return { driftX, driftY, amp, start, length };
}

/** Outward drift for one face. Spacing uses the widest phase so the float cannot close the gap. */
export function orbitNodeDrift(
  stageSize: number,
  nodeSize: number,
  index: number
): number {
  return (
    orbitStageLayout(stageSize).floatAmplitude *
    Math.min(1, nodeSize / 40) *
    orbitDriftPhase(index)
  );
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

/** Center-to-center distance that still clears both faces at full outward drift. */
function requiredSeparation(
  radiusA: number,
  sizeA: number,
  radiusB: number,
  sizeB: number,
  stageSize: number
): number {
  const air = NODE_RING_PADDING_PX * (stageSize / ORBIT_STAGE_SIZE);
  return (
    sizeA / 2 +
    sizeB / 2 +
    air +
    orbitNodeDrift(stageSize, sizeA, 4) +
    orbitNodeDrift(stageSize, sizeB, 4)
  );
}

function angularDistance(a: number, b: number): number {
  const tau = Math.PI * 2;
  const delta = Math.abs(a - b) % tau;
  return Math.min(delta, tau - delta);
}

/**
 * Gap between an outward spoke and a closer face.
 * The spoke is a ray from the center, so a face on the far side of the
 * circle is not on it.
 */
function rayClearance(
  angle: number,
  face: PlacedSpoke,
  stageSize: number
): number {
  const delta = angularDistance(angle, face.angle);
  if (delta > Math.PI / 2) return Number.POSITIVE_INFINITY;
  const miss = face.radius * Math.sin(delta);
  const air = SPOKE_AIR_PX * (stageSize / ORBIT_STAGE_SIZE);
  return miss - face.size / 2 - air;
}

function spokeDistance(
  radiusA: number,
  angleA: number,
  radiusB: number,
  angleB: number
): number {
  const dx = Math.cos(angleA) * radiusA - Math.cos(angleB) * radiusB;
  const dy = Math.sin(angleA) * radiusA - Math.sin(angleB) * radiusB;
  return Math.hypot(dx, dy);
}

type PlacedSpoke = { radius: number; size: number; angle: number };

function clearance(
  radius: number,
  size: number,
  angle: number,
  placed: readonly PlacedSpoke[],
  stageSize: number
): number {
  let min = Number.POSITIVE_INFINITY;
  for (const other of placed) {
    const dist = spokeDistance(radius, angle, other.radius, other.angle);
    const need = requiredSeparation(
      radius,
      size,
      other.radius,
      other.size,
      stageSize
    );
    min = Math.min(min, dist - need);
  }
  return min;
}

/** Face gap, and — for a farther ring — spoke gap against every closer face. */
function slotScore(
  radius: number,
  size: number,
  angle: number,
  placed: readonly PlacedSpoke[],
  stageSize: number
): number {
  let score = clearance(radius, size, angle, placed, stageSize);
  for (const other of placed) {
    if (other.radius + 0.5 >= radius) continue;
    score = Math.min(score, rayClearance(angle, other, stageSize));
  }
  return score;
}

/**
 * Slide one face along its ring until its spoke clears closer faces,
 * without leaving the open sector between its neighbors.
 */
function nudgeSpokeAngle(
  preferred: number,
  step: number,
  radius: number,
  size: number,
  placed: readonly PlacedSpoke[],
  stageSize: number,
  count: number
): number {
  const score = (angle: number) =>
    slotScore(radius, size, angle, placed, stageSize);
  const start = score(preferred);
  if (start >= -0.5) return preferred;
  const limit =
    count <= 1
      ? Math.PI
      : Math.max(
          0,
          (step -
            2 *
              Math.asin(
                Math.min(
                  1,
                  requiredSeparation(radius, size, radius, size, stageSize) /
                    (2 * radius)
                )
              )) /
            2 -
            0.02
        );
  let best = preferred;
  let bestScore = score(preferred);
  const steps = 48;
  for (let index = 1; index <= steps; index++) {
    const shift = (limit * index) / steps;
    for (const sign of [1, -1] as const) {
      const angle = preferred + sign * shift;
      const next = score(angle);
      if (next > bestScore) {
        bestScore = next;
        best = angle;
      }
      if (next >= -0.5) return angle;
    }
  }
  if (bestScore >= -0.5) return best;
  for (let index = 0; index < 360; index++) {
    const angle = -Math.PI + (index / 360) * Math.PI * 2;
    const next = score(angle);
    if (next > bestScore) {
      bestScore = next;
      best = angle;
    }
  }
  return best;
}

/**
 * Even spacing on a ring is the widest same-ring gap. The phase is the
 * rotation that leaves the most air against faces already on other rings,
 * including room for each farther spoke to pass between closer faces.
 */
function ringPhase(
  count: number,
  radius: number,
  size: number,
  placed: readonly PlacedSpoke[],
  stageSize: number
): number {
  const origin = -Math.PI / 2;
  if (count === 0 || placed.length === 0) return origin;
  const step = (Math.PI * 2) / count;
  let best = origin;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let sample = 0; sample < 72; sample++) {
    const phase = origin + (sample / 72) * step;
    let score = Number.POSITIVE_INFINITY;
    for (let index = 0; index < count; index++) {
      score = Math.min(
        score,
        slotScore(radius, size, phase + index * step, placed, stageSize)
      );
    }
    if (score > bestScore) {
      bestScore = score;
      best = phase;
    }
  }
  return best;
}

/**
 * Place orbit nodes on three rings — mutual inner, incoming mid, outgoing
 * outer — spreading spokes so no two avatars overlap and a farther line
 * passes between closer faces. Deterministic per account list, so server
 * and client render the same map.
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

  if (specs.length === 0) return [];

  const placed: PlacedSpoke[] = [];
  const nodes: OrbitPlacedNode[] = [];
  const rings = ['inner', 'mid', 'outer'] as const;
  for (const ring of rings) {
    const members = specs.filter((spec) => spec.ring === ring);
    if (members.length === 0) continue;
    const { radius, size } = members[0]!;
    const step = (Math.PI * 2) / members.length;
    const phase = ringPhase(members.length, radius, size, placed, stageSize);
    members.forEach((spec, index) => {
      const angle = nudgeSpokeAngle(
        phase + index * step,
        step,
        radius,
        size,
        placed,
        stageSize,
        members.length
      );
      const unitX = Math.cos(angle);
      const unitY = Math.sin(angle);
      placed.push({ radius: spec.radius, size: spec.size, angle });
      nodes.push({
        account: spec.account,
        x: Math.round(layout.center + unitX * spec.radius),
        y: Math.round(layout.center + unitY * spec.radius),
        size: spec.size,
        unitX,
        unitY,
        ring: spec.ring,
      });
    });
  }
  return nodes;
}

const LABEL_MAX_WIDTH_PX = 140;
const LABEL_CHAR_WIDTH_PX = 5.5;
const LABEL_CHROME_PX = 18;
const LABEL_EDGE_PAD_PX = 8;
/** Chip height: 0.68rem type, vertical padding, and the 1px border. */
const LABEL_HEIGHT_PX = 22;
/** Name plus the Endorsed line. */
export const ORBIT_ENDORSED_LABEL_HEIGHT_PX = 36;
const LABEL_GAP_PX = 6;
const LABEL_FACE_PAD_PX = 4;

export interface OrbitLabelOffset {
  x: number;
  y: number;
}

export interface OrbitLabelObstacle {
  x: number;
  y: number;
  radius: number;
}

function labelHalfWidth(label: string): number {
  return (
    Math.min(
      LABEL_MAX_WIDTH_PX,
      label.length * LABEL_CHAR_WIDTH_PX + LABEL_CHROME_PX
    ) / 2
  );
}

/**
 * Horizontal nudge keeping a node label inside the clipped stage wrap.
 * Labels sit above their node, so nodes near the wrap edge would
 * otherwise render their name half-cut. `stageInsetX` is the stage's
 * offset within the wrap (the wrap is what clips).
 */
export function orbitLabelShiftX({
  x,
  stageSize,
  stageInsetX,
  label,
}: {
  x: number;
  stageSize: number;
  stageInsetX: number;
  label: string;
}): number {
  const half =
    Math.min(
      LABEL_MAX_WIDTH_PX,
      label.length * LABEL_CHAR_WIDTH_PX + LABEL_CHROME_PX
    ) / 2;
  const leftBound = LABEL_EDGE_PAD_PX - stageInsetX;
  const rightBound = stageSize + stageInsetX - LABEL_EDGE_PAD_PX;
  if (x - half < leftBound) return Math.round(leftBound - (x - half));
  if (x + half > rightBound) return Math.round(rightBound - (x + half));
  return 0;
}

function circleHitsRect(
  cx: number,
  cy: number,
  radius: number,
  left: number,
  top: number,
  right: number,
  bottom: number
): boolean {
  const nearestX = Math.max(left, Math.min(cx, right));
  const nearestY = Math.max(top, Math.min(cy, bottom));
  const dx = cx - nearestX;
  const dy = cy - nearestY;
  return dx * dx + dy * dy < radius * radius;
}

function labelRect(
  nodeX: number,
  nodeY: number,
  offsetX: number,
  offsetY: number,
  halfW: number,
  halfH: number
) {
  return {
    left: nodeX + offsetX - halfW,
    right: nodeX + offsetX + halfW,
    top: nodeY + offsetY - halfH,
    bottom: nodeY + offsetY + halfH,
  };
}

function labelClipBounds(
  stageSize: number,
  stageInsetX: number,
  stageInsetY: number
) {
  return {
    left: LABEL_EDGE_PAD_PX - stageInsetX,
    right: stageSize + stageInsetX - LABEL_EDGE_PAD_PX,
    top: LABEL_EDGE_PAD_PX - stageInsetY,
    bottom: stageSize + stageInsetY - LABEL_EDGE_PAD_PX,
  };
}

/** Pull a chip back inside the wrap. The wrap is what clips the screen edge. */
function clampLabelOffset(
  offsetX: number,
  offsetY: number,
  nodeX: number,
  nodeY: number,
  halfW: number,
  halfH: number,
  bounds: { left: number; right: number; top: number; bottom: number }
): { x: number; y: number } {
  let x = offsetX;
  let y = offsetY;
  const roomX = bounds.right - bounds.left;
  const roomY = bounds.bottom - bounds.top;
  if (halfW * 2 >= roomX) {
    x = (bounds.left + bounds.right) / 2 - nodeX;
  } else {
    const left = nodeX + x - halfW;
    if (left < bounds.left) x += bounds.left - left;
    const right = nodeX + x + halfW;
    if (right > bounds.right) x -= right - bounds.right;
  }
  if (halfH * 2 >= roomY) {
    y = (bounds.top + bounds.bottom) / 2 - nodeY;
  } else {
    const top = nodeY + y - halfH;
    if (top < bounds.top) y += bounds.top - top;
    const bottom = nodeY + y + halfH;
    if (bottom > bounds.bottom) y -= bottom - bounds.bottom;
  }
  return { x, y };
}

/** Round the offset, then step back inside if rounding crossed the wrap. */
function snapInside(
  offset: number,
  node: number,
  half: number,
  boundStart: number,
  boundEnd: number
): number {
  let value = Math.round(offset);
  const start = node + value - half;
  if (start < boundStart) value += Math.ceil(boundStart - start);
  const end = node + value + half;
  if (end > boundEnd) value -= Math.ceil(end - boundEnd);
  return value;
}

/**
 * Where the name chip sits relative to its avatar center.
 * Prefer directly above the face. If that chip would cross the center
 * or another avatar, walk outward along the spoke until the chip is clear.
 * Every accepted spot stays inside the wrap, so the screen edge cannot cut it.
 */
export function orbitLabelOffset({
  x,
  y,
  size,
  unitX,
  unitY,
  stageSize,
  stageInsetX,
  stageInsetY = stageInsetX,
  label,
  labelHeight = LABEL_HEIGHT_PX,
  obstacles,
}: {
  x: number;
  y: number;
  size: number;
  unitX: number;
  unitY: number;
  stageSize: number;
  stageInsetX: number;
  stageInsetY?: number;
  label: string;
  labelHeight?: number;
  obstacles: readonly OrbitLabelObstacle[];
}): OrbitLabelOffset {
  const halfW = labelHalfWidth(label);
  const halfH = labelHeight / 2;
  const clear = size / 2 + LABEL_GAP_PX;
  const bounds = labelClipBounds(stageSize, stageInsetX, stageInsetY);
  const faces = [
    { x, y, radius: size / 2 + LABEL_FACE_PAD_PX },
    ...obstacles.map((obstacle) => ({
      x: obstacle.x,
      y: obstacle.y,
      radius: obstacle.radius + LABEL_FACE_PAD_PX,
    })),
  ];

  const place = (offsetX: number, offsetY: number): OrbitLabelOffset => {
    const clamped = clampLabelOffset(
      offsetX,
      offsetY,
      x,
      y,
      halfW,
      halfH,
      bounds
    );
    return {
      x: snapInside(clamped.x, x, halfW, bounds.left, bounds.right),
      y: snapInside(clamped.y, y, halfH, bounds.top, bounds.bottom),
    };
  };

  const hitsFor = (offset: OrbitLabelOffset): number => {
    const rect = labelRect(x, y, offset.x, offset.y, halfW, halfH);
    return faces.reduce(
      (count, face) =>
        count +
        (circleHitsRect(
          face.x,
          face.y,
          face.radius,
          rect.left,
          rect.top,
          rect.right,
          rect.bottom
        )
          ? 1
          : 0),
      0
    );
  };

  const raw: Array<{ x: number; y: number }> = [{ x: 0, y: -(clear + halfH) }];
  const extent = Math.abs(unitX) * halfW + Math.abs(unitY) * halfH;
  const spoke = Math.atan2(unitY, unitX);
  for (let ring = 0; ring < 12; ring++) {
    const distance = clear + extent + ring * 12;
    for (let step = 0; step < 16; step++) {
      const angle = spoke + (step / 16) * Math.PI * 2;
      raw.push({
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
      });
    }
  }

  let fallback = place(0, -(clear + halfH));
  let fallbackHits = hitsFor(fallback);
  for (const candidate of raw) {
    const offset = place(candidate.x, candidate.y);
    const hits = hitsFor(offset);
    if (hits === 0) return offset;
    if (hits < fallbackHits) {
      fallbackHits = hits;
      fallback = offset;
    }
  }
  return fallback;
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
