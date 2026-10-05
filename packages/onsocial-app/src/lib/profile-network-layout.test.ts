import { describe, expect, it } from 'vitest';
import type { NetworkAccount } from './profile-network';
import {
  orbitCenterIdentity,
  orbitStageLayout,
  placeNetworkNodes,
} from './profile-network-layout';

function account(accountId: string, kind: NetworkAccount['kind']): NetworkAccount {
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
      Array.from({ length: 20 }, (_, i) => account(`${prefix}${i}.testnet`, kind));
    const nodes = placeNetworkNodes(
      [...many('mutual', 'm'), ...many('incoming', 'i'), ...many('outgoing', 'o')],
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
    // 36 spokes cannot all keep the ideal angular gap (36 x min-gap > 2pi),
    // so placement falls back to best-effort spacing. This matches the
    // portal orbit's shipped behavior — assert the regression floor (no two
    // same-ring nodes stack; observed worst pair clears ~0.54 of size).
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
