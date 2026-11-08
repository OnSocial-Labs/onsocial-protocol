import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = dirname(fileURLToPath(import.meta.url));

describe('look preview banner parity', () => {
  it('matches profile edit banner overlay and empty affordances', () => {
    for (const file of [
      'guild-look-preview.tsx',
      '../scarces/hub-look-preview.tsx',
      '../protocol/dao-look-preview.tsx',
    ]) {
      const src = readFileSync(join(root, file), 'utf8');
      expect(src).toContain('account-editor-banner-backdrop');
      expect(src).toContain('account-editor-banner-empty');
      expect(src).toContain('account-editor-banner-overlay');
      expect(src).toContain('profile-editor-media-size-hint--dock');
      expect(src).toContain("t('look.photoOrVideo')");
      expect(src).not.toMatch(/look-preview-banner-empty|cover-empty/);
    }
  });
});
