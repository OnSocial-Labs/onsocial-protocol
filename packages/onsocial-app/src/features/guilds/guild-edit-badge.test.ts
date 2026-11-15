import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const guildsDir = dirname(fileURLToPath(import.meta.url));

describe('guild edit badge media', () => {
  it('composes GuildBadgeWell (shared look-preview mark)', () => {
    const edit = readFileSync(join(guildsDir, 'guild-edit-sheet.tsx'), 'utf8');
    const well = readFileSync(join(guildsDir, 'guild-look-preview.tsx'), 'utf8');
    expect(edit).toContain('GuildBadgeWell');
    expect(edit).not.toContain('guild-edit-badge-picker');
    expect(edit).not.toContain('OsFieldRemove');
    expect(well).toContain('ProfileEditorMediaToolbar');
    expect(well).toContain('layout="avatar"');
    expect(well).toContain('profile-editor-media-backdrop');
  });
});
