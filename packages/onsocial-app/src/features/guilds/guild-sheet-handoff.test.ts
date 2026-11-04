import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  GUILD_SETTINGS_HANDOFF_CROSSFADE_MS,
  guildSettingsDrawerPresentation,
  guildSettingsHandoffIsReplace,
  latchOpenedSwap,
} from '@/features/guilds/guild-sheet-handoff';

const guildsDir = dirname(fileURLToPath(import.meta.url));

describe('latchOpenedSwap', () => {
  it('holds the crossfade after the handoff flag drops', () => {
    expect(latchOpenedSwap(true, true, false)).toBe(true);
    expect(latchOpenedSwap(true, false, true)).toBe(true);
    expect(latchOpenedSwap(false, true, true)).toBe(false);
    expect(latchOpenedSwap(true, false, false)).toBe(false);
  });
});

describe('guildSettingsDrawerPresentation', () => {
  it('keeps enter during handoff so GlassSheet can crossfade', () => {
    expect(guildSettingsDrawerPresentation(true, true, false)).toBe('enter');
    expect(guildSettingsDrawerPresentation(true, true, true)).toBe('enter');
  });

  it('holds swap after settle so clearing handoff does not slide', () => {
    expect(guildSettingsDrawerPresentation(true, false, true)).toBe('swap');
    expect(guildSettingsDrawerPresentation(true, false, false)).toBe('enter');
    expect(guildSettingsDrawerPresentation(false, false, true)).toBe('enter');
  });
});

describe('guildSettingsHandoffIsReplace', () => {
  it('replaces hug successors and dismisses into edit slide-over', () => {
    expect(guildSettingsHandoffIsReplace('rooms')).toBe(true);
    expect(guildSettingsHandoffIsReplace('storage')).toBe(true);
    expect(guildSettingsHandoffIsReplace('proposals')).toBe(true);
    expect(guildSettingsHandoffIsReplace('requests')).toBe(true);
    expect(guildSettingsHandoffIsReplace('edit')).toBe(false);
  });
});

describe('settings drawer handoff wiring', () => {
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
    const settings = readFileSync(
      join(guildsDir, 'guild-settings-sheet.tsx'),
      'utf8'
    );

    expect(hook).toContain('latchOpenedSwap');
    expect(hook).toContain('guildSettingsDrawerPresentation');
    expect(hook).toContain('GUILD_SETTINGS_HANDOFF_CROSSFADE_MS');
    expect(GUILD_SETTINGS_HANDOFF_CROSSFADE_MS).toBe(180);
    for (const sheet of [rooms, proposals, storage]) {
      expect(sheet).toContain('useGuildSettingsDrawerHandoff');
      expect(sheet).toContain('presentation={presentation}');
    }
    const settleCount = (
      panel.match(/onPresented=\{settleSheetHandoff\}/g) ?? []
    ).length;
    expect(settleCount).toBe(3);
    expect(panel).toContain('open={settingsSheetOpen}');
    expect(panel).toContain('open={factsSheetOpen}');
    expect(panel).toContain('guildSettingsHandoffIsReplace');
    expect(panel).not.toContain('settingsSheetOpen ? (');
    expect(settings).toContain('if (open) setClosing(false)');
    expect(editor).toContain('presentation="appear"');
  });
});
