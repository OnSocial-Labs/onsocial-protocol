import { describe, expect, it, beforeEach } from 'vitest';
import {
  paintOverlayStack,
  readOverlaySnap,
  resetOverlayStackForTests,
  setOverlayDockClearanceReader,
  syncOverlayEntry,
} from './overlay-stack.js';

describe('paintOverlayStack', () => {
  it('keeps a lone keep-dock sheet on its floor so the dock stays above it', () => {
    expect(paintOverlayStack([{ id: 1, floor: 50, keepDock: true }])).toEqual([
      { id: 1, z: 50, top: true },
    ]);
  });

  it('keeps a post trail on one height', () => {
    expect(
      paintOverlayStack([
        { id: 1, floor: 50, keepDock: true },
        { id: 2, floor: 50, keepDock: true },
      ]).map((entry) => entry.z)
    ).toEqual([50, 50]);
  });

  it('puts a later modal strictly above the open top and a lifted dock', () => {
    const painted = paintOverlayStack(
      [
        { id: 1, floor: 170, keepDock: true },
        { id: 2, floor: 60, keepDock: false },
      ],
      172
    );
    expect(painted[1]?.z).toBeGreaterThan(170);
    expect(painted[1]?.z).toBeGreaterThan(172);
    expect(painted[1]?.top).toBe(true);
    expect(painted[0]?.top).toBe(false);
  });

  it('restacks a later cover above a sheet whose floor jumps', () => {
    const before = paintOverlayStack([
      { id: 1, floor: 90, keepDock: true },
      { id: 2, floor: 80, keepDock: true },
    ]);
    expect(before.map((entry) => entry.z)).toEqual([90, 90]);
    const after = paintOverlayStack([
      { id: 1, floor: 170, keepDock: true },
      { id: 2, floor: 80, keepDock: true },
    ]);
    expect(after[0]?.z).toBe(170);
    expect(after[1]?.z).toBeGreaterThanOrEqual(170);
  });

  it('lifts the launcher above a face-lifted sheet', () => {
    const painted = paintOverlayStack(
      [
        { id: 1, floor: 170, keepDock: true },
        { id: 2, floor: 51, keepDock: false },
      ],
      172
    );
    expect(painted[1]?.z).toBeGreaterThan(170);
    expect(painted[1]?.z).toBeGreaterThan(172);
  });

  it('lets a cover floor that already clears the sheet stay above it', () => {
    const painted = paintOverlayStack([
      { id: 1, floor: 170, keepDock: true },
      { id: 2, floor: 171, keepDock: true },
    ]);
    expect(painted[1]?.z).toBeGreaterThan(painted[0]?.z ?? 0);
  });
});

describe('overlay stack store', () => {
  beforeEach(() => {
    resetOverlayStackForTests();
    setOverlayDockClearanceReader(() => 172);
  });

  it('raises a modal opened after a keep-dock sheet without moving the sheet', () => {
    syncOverlayEntry(1, { active: true, floor: 170, keepDock: true });
    syncOverlayEntry(2, { active: true, floor: 56, keepDock: false });
    expect(readOverlaySnap(1, 170)).toMatchObject({ z: 170, top: false });
    expect(readOverlaySnap(2, 56).z).toBeGreaterThan(172);
    expect(readOverlaySnap(2, 56).top).toBe(true);
  });

  it('keeps open order when a floor updates', () => {
    syncOverlayEntry(1, { active: true, floor: 90, keepDock: true });
    syncOverlayEntry(2, { active: true, floor: 171, keepDock: true });
    syncOverlayEntry(1, { active: true, floor: 170, keepDock: true });
    const sheet = readOverlaySnap(1, 170);
    const cover = readOverlaySnap(2, 171);
    expect(cover.z).toBeGreaterThanOrEqual(sheet.z);
    expect(cover.top).toBe(true);
  });
});
