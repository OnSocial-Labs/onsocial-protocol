import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { nextHeldStake } from '@/features/protocol/dao-manage-sheet';

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'dao-manage-sheet.tsx'),
  'utf8'
);

describe('DaoManageSheet chrome', () => {
  it('uses ActionDrawer like guild Manage, not a custom surface-row hug', () => {
    expect(src).toContain('ActionDrawer');
    expect(src).toContain('os-sheet-cap-short');
    expect(src).not.toContain('OsHugSheet');
    expect(src).not.toContain('OsSurfaceRow');
  });

  it('splits Edit (config) from Publish OnSocial / Call actions', () => {
    expect(src).toContain("'publish-social'");
    expect(src).toContain('Publish OnSocial profile');
    expect(src).toContain('canProposeCall');
    expect(src).toContain('Cover, crest, name, and purpose (config)');
    expect(src).toMatch(/canEdit[\s\S]*run\('edit'\)/);
    expect(src).toMatch(/canProposeCall[\s\S]*run\('publish-social'\)/);
  });

  it('hides Propose until this DAO confirms the viewer can propose', () => {
    expect(src).toMatch(/canPropose\s*\?[\s\S]*run\('propose'\)/);
    expect(src).not.toMatch(
      /items: ActionDrawerItem\[\] = \[\s*\{\s*id: 'propose'/
    );
  });

  it('freezes Stake only after the path check settles', () => {
    expect(src).toContain('nextHeldStake');
    expect(src).toContain('stakePathReady');
    expect(src).toContain('heldShowStake === true');
  });
});

describe('nextHeldStake', () => {
  it('stays hidden until the path check settles', () => {
    expect(
      nextHeldStake({
        open: true,
        wasOpen: false,
        held: null,
        stakePathReady: false,
        showStake: false,
      })
    ).toBeNull();
    expect(
      nextHeldStake({
        open: true,
        wasOpen: true,
        held: null,
        stakePathReady: false,
        showStake: true,
      })
    ).toBeNull();
  });

  it('adopts the first settled answer while Manage is open', () => {
    expect(
      nextHeldStake({
        open: true,
        wasOpen: true,
        held: null,
        stakePathReady: true,
        showStake: true,
      })
    ).toBe(true);
    expect(
      nextHeldStake({
        open: true,
        wasOpen: true,
        held: null,
        stakePathReady: true,
        showStake: false,
      })
    ).toBe(false);
  });

  it('keeps that answer when a later fetch disagrees', () => {
    expect(
      nextHeldStake({
        open: true,
        wasOpen: true,
        held: true,
        stakePathReady: true,
        showStake: false,
      })
    ).toBe(true);
    expect(
      nextHeldStake({
        open: true,
        wasOpen: true,
        held: false,
        stakePathReady: true,
        showStake: true,
      })
    ).toBe(false);
  });

  it('clears the hold when Manage closes', () => {
    expect(
      nextHeldStake({
        open: false,
        wasOpen: true,
        held: true,
        stakePathReady: true,
        showStake: true,
      })
    ).toBeNull();
  });
});
