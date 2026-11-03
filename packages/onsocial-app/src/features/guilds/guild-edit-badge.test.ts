import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const guildsDir = dirname(fileURLToPath(import.meta.url));

describe('guild edit badge media', () => {
  it('uses the shared profile editor toolbar and overlay', () => {
    const edit = readFileSync(
      join(guildsDir, 'guild-edit-sheet.tsx'),
      'utf8'
    );
    expect(edit).toContain('guild-edit-badge-picker profile-editor-media-host');
    expect(edit).toContain('profile-editor-media-backdrop');
    expect(edit).toContain('profile-editor-media-overlay');
    expect(edit).toContain('ProfileEditorMediaToolbar');
    expect(edit).toContain('layout="avatar"');
    expect(edit).not.toContain('OsFieldRemove');
  });
});
