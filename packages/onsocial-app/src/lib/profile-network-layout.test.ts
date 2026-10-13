import { describe, expect, it } from 'vitest';
import type { NetworkAccount } from './profile-network';
import {
  orbitCenterIdentity,
  orbitFitStageSize,
  orbitLabelOffset,
  orbitLabelShiftX,
  orbitNodeDrift,
  orbitSpokeJoin,
  orbitStageLayout,
  ORBIT_ENDORSED_LABEL_HEIGHT_PX,
  placeNetworkNodes,
} from './profile-network-layout';

function account(
  accountId: string,
  kind: NetworkAccount['kind']
): NetworkAccount {
  return { accountId, name: null, avatarUrl: null, kind };
}

describe('placeNetworkNodes', () => {
  it('places mutuals on the inner ring, incoming mid, outgoing outer', () => {
    const nodes = placeNetworkNodes(
      [
        account('m1.testnet', 'mutual'),
        account('i1.testnet', 'incoming'),
        account('o1.testnet', 'outgoing'),
      ],
      460
    );
    const layout = orbitStageLayout(460);
    const byId = new Map(nodes.map((n) => [n.account.accountId, n]));
    const distance = (id: string) => {
      const node = byId.get(id);
      if (!node) throw new Error(`missing node ${id}`);
      return Math.hypot(node.x - layout.center, node.y - layout.center);
    };
    expect(distance('m1.testnet')).toBeCloseTo(layout.innerRadius, 0);
    expect(distance('i1.testnet')).toBeCloseTo(layout.midRadius, 0);
    expect(distance('o1.testnet')).toBeCloseTo(layout.outerRadius, 0);
  });

  it('caps each ring at the ring cap', () => {
    const many = (kind: NetworkAccount['kind'], prefix: string) =>
      Array.from({ length: 20 }, (_, i) =>
        account(`${prefix}${i}.testnet`, kind)
      );
    const nodes = placeNetworkNodes(
      [
        ...many('mutual', 'm'),
        ...many('incoming', 'i'),
        ...many('outgoing', 'o'),
      ],
      460
    );
    expect(nodes.filter((n) => n.ring === 'inner')).toHaveLength(12);
    expect(nodes.filter((n) => n.ring === 'mid')).toHaveLength(12);
    expect(nodes.filter((n) => n.ring === 'outer')).toHaveLength(12);
    expect(nodes).toHaveLength(36);
  });

  it('keeps same-ring avatars clear at typical load', () => {
    const nodes = placeNetworkNodes(
      Array.from({ length: 18 }, (_, i) =>
        account(
          `a${i}.testnet`,
          i < 6 ? 'mutual' : i < 12 ? 'incoming' : 'outgoing'
        )
      ),
      460
    );
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]!;
        const b = nodes[j]!;
        if (a.ring !== b.ring) continue;
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        expect(distance).toBeGreaterThanOrEqual(Math.min(a.size, b.size));
      }
    }
  });

  it('degrades gracefully at full saturation (36 nodes)', () => {
    // A full ring is spaced evenly. Assert the floor: no two same-ring
    // faces stack.
    const nodes = placeNetworkNodes(
      Array.from({ length: 36 }, (_, i) =>
        account(
          `a${i}.testnet`,
          i < 12 ? 'mutual' : i < 24 ? 'incoming' : 'outgoing'
        )
      ),
      460
    );
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]!;
        const b = nodes[j]!;
        if (a.ring !== b.ring) continue;
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        expect(distance).toBeGreaterThanOrEqual(Math.min(a.size, b.size) * 0.5);
      }
    }
  });

  it('is deterministic for the same account list', () => {
    const accounts = [
      account('m1.testnet', 'mutual'),
      account('i1.testnet', 'incoming'),
      account('o1.testnet', 'outgoing'),
    ];
    expect(placeNetworkNodes(accounts, 460)).toEqual(
      placeNetworkNodes(accounts, 460)
    );
  });

  it('returns an empty list for no accounts', () => {
    expect(placeNetworkNodes([], 460)).toEqual([]);
  });

  it('keeps a farther spoke out of closer faces', () => {
    const rank = { inner: 0, mid: 1, outer: 2 } as const;
    const cases = [
      { mutual: 6, incoming: 6, outgoing: 6 },
      { mutual: 4, incoming: 2, outgoing: 7 },
      { mutual: 5, incoming: 3, outgoing: 8 },
    ];
    for (const stageSize of [460, 837]) {
      for (const counts of cases) {
        const accounts = [
          ...Array.from({ length: counts.mutual }, (_, i) =>
            account(`m${i}.testnet`, 'mutual')
          ),
          ...Array.from({ length: counts.incoming }, (_, i) =>
            account(`i${i}.testnet`, 'incoming')
          ),
          ...Array.from({ length: counts.outgoing }, (_, i) =>
            account(`o${i}.testnet`, 'outgoing')
          ),
        ];
        const layout = orbitStageLayout(stageSize);
        const nodes = placeNetworkNodes(accounts, stageSize);
        const air = 8 * (stageSize / 460);
        for (const node of nodes) {
          for (const closer of nodes) {
            if (rank[closer.ring] >= rank[node.ring]) continue;
            const cx = closer.x - layout.center;
            const cy = closer.y - layout.center;
            const along = cx * node.unitX + cy * node.unitY;
            if (along <= 0) continue;
            const miss = Math.abs(cx * node.unitY - cy * node.unitX);
            const gap = miss - closer.size / 2;
            expect(
              gap,
              `${stageSize} ${counts.mutual}/${counts.incoming}/${counts.outgoing} ${closer.ring}->${node.ring}`
            ).toBeGreaterThanOrEqual(air - 2);
          }
        }
      }
    }
  });

  it('keeps air between faces at the closest point of the drift', () => {
    const accounts = Array.from({ length: 18 }, (_, i) =>
      account(
        `a${i}.testnet`,
        i < 6 ? 'mutual' : i < 12 ? 'incoming' : 'outgoing'
      )
    );
    for (const stageSize of [276, 460, 837]) {
      const layout = orbitStageLayout(stageSize);
      const nodes = placeNetworkNodes(accounts, stageSize);
      const faces = [
        {
          x: layout.center,
          y: layout.center,
          size: layout.centerAvatar,
          unitX: 0,
          unitY: 0,
        },
        ...nodes,
      ];
      const air = 10 * (stageSize / 460);
      for (let i = 0; i < faces.length; i++) {
        for (let j = i + 1; j < faces.length; j++) {
          const a = faces[i]!;
          const b = faces[j]!;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy);
          const ux = dx / dist;
          const uy = dy / dist;
          const closeA =
            Math.max(0, a.unitX * ux + a.unitY * uy) *
            orbitNodeDrift(stageSize, a.size, 4);
          const closeB =
            Math.max(0, -(b.unitX * ux + b.unitY * uy)) *
            orbitNodeDrift(stageSize, b.size, 4);
          const gap = dist - a.size / 2 - b.size / 2 - closeA - closeB;
          expect(gap, `${stageSize}`).toBeGreaterThanOrEqual(air - 2);
        }
      }
    }
  });
});

describe('orbitLabelShiftX', () => {
  // Mobile portrait: 276px stage centered in a 358px wrap → 41px inset.
  const base = { stageSize: 276, stageInsetX: 41 };
  const longName = 'a-very-long-display-name.testnet'; // width caps at 140 → half 70

  it('leaves labels that fit alone', () => {
    expect(orbitLabelShiftX({ x: 138, label: 'bob.testnet', ...base })).toBe(0);
    // Short label at the outer-ring edge still fits thanks to the wrap inset.
    expect(orbitLabelShiftX({ x: 28, label: 'bob.testnet', ...base })).toBe(0);
    expect(orbitLabelShiftX({ x: 248, label: 'bob.testnet', ...base })).toBe(0);
  });

  it('pulls long left-edge labels back into the wrap', () => {
    // Left edge 28-70=-42 passes the bound 8-41=-33 → shift +9.
    expect(orbitLabelShiftX({ x: 28, label: longName, ...base })).toBe(9);
  });

  it('pulls long right-edge labels back into the wrap', () => {
    // Right edge 248+70=318 passes the bound 276+41-8=309 → shift -9.
    expect(orbitLabelShiftX({ x: 248, label: longName, ...base })).toBe(-9);
  });

  it('shifts more when the wrap barely exceeds the stage', () => {
    const tight = { stageSize: 276, stageInsetX: 12 };
    // Bound 276+12-8=280 → 318-280 = -38.
    expect(orbitLabelShiftX({ x: 248, label: longName, ...tight })).toBe(-38);
    // Even a short label clips now: 248+39.25=287.25 → shift -7.25 → -7.
    expect(orbitLabelShiftX({ x: 248, label: 'bob.testnet', ...tight })).toBe(
      -7
    );
  });
});

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

describe('orbitFitStageSize', () => {
  it('grows with the wrap instead of stopping at the design size', () => {
    expect(orbitFitStageSize(900, 860)).toBeGreaterThan(460);
    expect(orbitFitStageSize(542, 861)).toBe(518);
  });

  it('follows the shorter side so a short window stays smaller', () => {
    expect(orbitFitStageSize(900, 400)).toBe(376);
    expect(orbitFitStageSize(400, 900)).toBe(orbitFitStageSize(900, 400));
  });

  it('floors when the wrap is tighter than the smallest ring', () => {
    expect(orbitFitStageSize(200, 180)).toBe(260);
  });
});

describe('orbitLabelOffset', () => {
  it('keeps a clear name above its face', () => {
    const offset = orbitLabelOffset({
      x: 230,
      y: 80,
      size: 30,
      unitX: 0,
      unitY: -1,
      stageSize: 460,
      stageInsetX: 40,
      label: 'Ada',
      obstacles: [{ x: 230, y: 230, radius: 42 }],
    });
    expect(offset.y).toBeLessThan(0);
    expect(offset.x).toBe(0);
  });

  it('lifts an Endorsed chip further clear of the face', () => {
    const input = {
      x: 230,
      y: 80,
      size: 30,
      unitX: 0,
      unitY: -1,
      stageSize: 460,
      stageInsetX: 40,
      label: 'Ada',
      obstacles: [{ x: 230, y: 230, radius: 42 }],
    };
    const name = orbitLabelOffset(input);
    const endorsed = orbitLabelOffset({
      ...input,
      labelHeight: ORBIT_ENDORSED_LABEL_HEIGHT_PX,
    });
    expect(endorsed.y).toBeLessThan(name.y);
  });

  it('moves a name off the center and off neighboring faces', () => {
    const names = [
      'Playground test02_onsocial',
      'Berry Samba',
      'Testing 0001 account',
      'Voter 02',
      'Test 04',
      'Green Ghost Testing',
    ];
    for (const stageSize of [276, 360, 460]) {
      const accounts = names.map((name, index) => ({
        ...account(
          `${name}-${index}.testnet`,
          index < 2 ? 'mutual' : 'incoming'
        ),
        name,
      }));
      const nodes = placeNetworkNodes(
        [
          ...accounts,
          ...Array.from({ length: 10 }, (_, index) =>
            account(`outer-${index}.testnet`, 'outgoing')
          ),
        ],
        stageSize
      );
      const layout = orbitStageLayout(stageSize);
      for (const node of nodes) {
        const label = node.account.name?.trim() || node.account.accountId;
        const offset = orbitLabelOffset({
          x: node.x,
          y: node.y,
          size: node.size,
          unitX: node.unitX,
          unitY: node.unitY,
          stageSize,
          stageInsetX: 12,
          label,
          obstacles: [
            {
              x: layout.center,
              y: layout.center,
              radius: layout.centerAvatar / 2,
            },
            ...nodes
              .filter((other) => other !== node)
              .map((other) => ({
                x: other.x,
                y: other.y,
                radius: other.size / 2,
              })),
          ],
        });
        const halfW = Math.min(140, label.length * 5.5 + 18) / 2;
        const rect = {
          left: node.x + offset.x - halfW,
          right: node.x + offset.x + halfW,
          top: node.y + offset.y - 11,
          bottom: node.y + offset.y + 11,
        };
        const faces = [
          {
            x: layout.center,
            y: layout.center,
            radius: layout.centerAvatar / 2,
          },
          ...nodes.map((other) => ({
            x: other.x,
            y: other.y,
            radius: other.size / 2,
          })),
        ];
        for (const face of faces) {
          expect(
            circleHitsRect(
              face.x,
              face.y,
              face.radius,
              rect.left,
              rect.top,
              rect.right,
              rect.bottom
            ),
            `${label} on ${stageSize}`
          ).toBe(false);
        }
      }
    }
  });
});

describe('orbitSpokeJoin', () => {
  it('meets the face ring and travels with the face', () => {
    const cases = [
      { unitX: 1, unitY: 0, amplitude: 2.4 },
      { unitX: 0, unitY: -1, amplitude: 3 },
      { unitX: Math.cos(0.7), unitY: Math.sin(0.7), amplitude: 2.2 },
      { unitX: Math.cos(2.2), unitY: Math.sin(2.2), amplitude: 1.1 },
    ];
    for (const item of cases) {
      const join = orbitSpokeJoin({
        nodeX: 230 + item.unitX * 140,
        nodeY: 230 + item.unitY * 140,
        nodeSize: 40,
        unitX: item.unitX,
        unitY: item.unitY,
        center: 230,
        centerRadius: 42,
        amplitude: item.amplitude,
      });
      const along = join.driftX * item.unitX + join.driftY * item.unitY;
      expect(join.amp).toBeCloseTo(along, 5);
      expect(join.start).toBeCloseTo(42 - 1.5 - along, 5);
      const endFromNode = 140 - (join.start + join.length);
      expect(20 - endFromNode).toBeCloseTo(1.5, 5);
    }
  });
});

describe('orbitCenterIdentity', () => {
  it('is stable per account and produces a hue', () => {
    const a = orbitCenterIdentity('alice.testnet');
    expect(a).toEqual(orbitCenterIdentity('alice.testnet'));
    expect(a.primaryHue).toBeGreaterThanOrEqual(0);
    expect(a.primaryHue).toBeLessThan(360);
    expect(a.gradient).toContain('radial-gradient');
    expect(orbitCenterIdentity('bob.testnet').primaryHue).not.toBe(
      orbitCenterIdentity('alice.testnet').primaryHue
    );
  });
});
