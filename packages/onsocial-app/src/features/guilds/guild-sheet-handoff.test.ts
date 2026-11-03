import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { latchOpenedSwap } from '@/features/guilds/guild-sheet-handoff';

const guildsDir = dirname(fileURLToPath(import.meta.url));

describe('latchOpenedSwap', () => {
  it('holds the crossfade after the handoff flag drops', () => {
    expect(latchOpenedSwap(true, true, false)).toBe(true);
    expect(latchOpenedSwap(true, false, true)).toBe(true);
    expect(latchOpenedSwap(false, true, true)).toBe(false);
    expect(latchOpenedSwap(true, false, false)).toBe(false);
  });

  it('settles the settings handoff once drawer sheets have presented', () => {
    const hook = readFileSync(
      join(guildsDir, 'use-guild-settings-drawer-handoff.ts'),
      'utf8'
    );
    const rooms = readFileSync(
      join(guildsDir, 'guild-rooms-sheet.tsx'),
      'utf8'
    );
    const proposals = readFileSync(
      join(guildsDir, 'guild-proposals-sheet.tsx'),
      'utf8'
    );
    const storage = readFileSync(
      join(guildsDir, 'guild-group-storage-sheet.tsx'),
      'utf8'
    );
    const panel = readFileSync(join(guildsDir, 'live-guild-panel.tsx'), 'utf8');
    const editor = readFileSync(
      join(guildsDir, 'guild-room-editor.tsx'),
      'utf8'
    );

    expect(hook).toContain('latchOpenedSwap');
    for (const sheet of [rooms, proposals, storage]) {
      expect(sheet).toContain('useGuildSettingsDrawerHandoff');
      expect(sheet).toContain('presentation={presentation}');
    }
    const settleCount = (
      panel.match(/onPresented=\{settleSheetHandoff\}/g) ?? []
    ).length;
    expect(settleCount).toBe(3);
    expect(editor).toContain('presentation="appear"');
  });
});
