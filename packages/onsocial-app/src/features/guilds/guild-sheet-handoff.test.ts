import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const guildsDir = dirname(fileURLToPath(import.meta.url));

describe('settings drawer handoff wiring', () => {
  it('claims one replace and leaves motion to GlassSheet', () => {
    const panel = readFileSync(join(guildsDir, 'live-guild-panel.tsx'), 'utf8');
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
    const settings = readFileSync(
      join(guildsDir, 'guild-settings-sheet.tsx'),
      'utf8'
    );

    expect(panel).toContain('replaceSheet()');
    expect(panel).not.toContain('guildSettingsHandoffIsReplace');
    expect(panel).not.toContain('setSheetHandoff');
    expect(panel).not.toContain('SheetHandoffProvider');
    expect(panel).toContain('open={settingsSheetOpen}');
    expect(panel).toContain('open={factsSheetOpen}');
    for (const sheet of [rooms, proposals, storage]) {
      expect(sheet).not.toContain('useGuildSettingsDrawerHandoff');
      expect(sheet).not.toContain('presentation={presentation}');
    }
    expect(settings).toContain('if (open) setClosing(false)');
  });
});
