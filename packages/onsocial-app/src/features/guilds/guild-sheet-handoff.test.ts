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

  it('settles the settings handoff once rooms has presented', () => {
    const rooms = readFileSync(
      join(guildsDir, 'guild-rooms-sheet.tsx'),
      'utf8'
    );
    const panel = readFileSync(join(guildsDir, 'live-guild-panel.tsx'), 'utf8');
    const editor = readFileSync(
      join(guildsDir, 'guild-room-editor.tsx'),
      'utf8'
    );
    expect(rooms).toContain('latchOpenedSwap');
    expect(rooms).toContain("presentation={latchedSwap ? 'swap' : 'enter'}");
    expect(panel).toContain('onPresented={settleSheetHandoff}');
    expect(editor).toContain('presentation="appear"');
  });
});
