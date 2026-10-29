'use client';

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';

/**
 * One overlay stack for every portaled sheet and slide-over.
 *
 * Open order is paint order. A later overlay is at least as high as whatever
 * is already open, and a modal (anything that does not keep the dock) sits
 * strictly above that and above a lifted reply dock. A keep-dock layer keeps
 * its floor when that floor already matches the open top, so a post trail
 * stays under the dock at 51 instead of covering it.
 */
export type OverlayStackEntry = {
  id: number;
  floor: number;
  keepDock: boolean;
};

export type OverlayStackPaint = {
  id: number;
  z: number;
  top: boolean;
};

export function paintOverlayStack(
  entries: readonly OverlayStackEntry[],
  dockClearance = 0
): OverlayStackPaint[] {
  let cursor = 0;
  const last = entries.length - 1;
  return entries.map((entry, index) => {
    const aboveOpen = cursor > 0 && !entry.keepDock ? cursor + 1 : cursor;
    const aboveDock =
      !entry.keepDock && dockClearance > 0 ? dockClearance + 1 : 0;
    const z = Math.max(entry.floor, aboveOpen, aboveDock);
    cursor = z;
    return { id: entry.id, z, top: index === last };
  });
}

type LiveEntry = OverlayStackEntry & {
  snap: { z: number; top: boolean };
};

const entries: LiveEntry[] = [];
const listeners = new Set<() => void>();
const inactiveSnaps = new Map<number, { z: number; top: boolean }>();
let nextId = 1;
let readDockClearance = defaultDockClearance;

function defaultDockClearance(): number {
  if (typeof document === 'undefined') return 0;
  const raw = document.body?.style.getPropertyValue('--os-thread-dock-z') ?? '';
  if (!raw) return 0;
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

function inactiveSnap(floor: number): { z: number; top: boolean } {
  const cached = inactiveSnaps.get(floor);
  if (cached) return cached;
  const snap = { z: floor, top: true };
  inactiveSnaps.set(floor, snap);
  return snap;
}

function publish(): void {
  const painted = paintOverlayStack(entries, readDockClearance());
  let changed = false;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const next = painted[index];
    if (!entry || !next) continue;
    if (entry.snap.z !== next.z || entry.snap.top !== next.top) {
      entry.snap = { z: next.z, top: next.top };
      changed = true;
    }
  }
  if (!changed) return;
  for (const listener of listeners) listener();
}

export function createOverlayId(): number {
  nextId += 1;
  return nextId;
}

export function syncOverlayEntry(
  id: number,
  input: { active: boolean; floor: number; keepDock: boolean }
): void {
  const index = entries.findIndex((entry) => entry.id === id);
  if (!input.active) {
    if (index === -1) return;
    entries.splice(index, 1);
    publish();
    return;
  }
  if (index === -1) {
    entries.push({
      id,
      floor: input.floor,
      keepDock: input.keepDock,
      snap: { z: input.floor, top: true },
    });
    publish();
    return;
  }
  const entry = entries[index];
  if (!entry) return;
  entry.floor = input.floor;
  entry.keepDock = input.keepDock;
  publish();
}

export function subscribeOverlayStack(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function readOverlaySnap(
  id: number,
  floor: number
): { z: number; top: boolean } {
  return entries.find((entry) => entry.id === id)?.snap ?? inactiveSnap(floor);
}

/** Test hook. Production reads `--os-thread-dock-z` on `document.body`. */
export function setOverlayDockClearanceReader(
  reader: (() => number) | null
): void {
  readDockClearance = reader ?? defaultDockClearance;
}

export function resetOverlayStackForTests(): void {
  entries.splice(0, entries.length);
  listeners.clear();
  inactiveSnaps.clear();
  nextId = 1;
  readDockClearance = defaultDockClearance;
}

/**
 * Join the overlay stack while `active`. `floor` is the band this surface
 * would use on an empty screen. The returned `z` is that floor, or higher
 * when something is already open. `top` is false when a later overlay is up.
 */
export function useOverlayStackZ(
  active: boolean,
  floor: number,
  keepDock = false
): { z: number; top: boolean } {
  const idRef = useRef(0);
  if (idRef.current === 0) idRef.current = createOverlayId();
  const id = idRef.current;

  useLayoutEffect(() => {
    syncOverlayEntry(id, { active, floor, keepDock });
  }, [active, floor, id, keepDock]);

  useLayoutEffect(() => {
    return () => {
      syncOverlayEntry(id, { active: false, floor: 0, keepDock: false });
    };
  }, [id]);

  const subscribe = useCallback(
    (listener: () => void) => subscribeOverlayStack(listener),
    []
  );
  const getSnapshot = useCallback(
    () => readOverlaySnap(id, floor),
    [floor, id]
  );
  const serverSnap = useMemo(() => ({ z: floor, top: true }), [floor]);

  return useSyncExternalStore(subscribe, getSnapshot, () => serverSnap);
}
