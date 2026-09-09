import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appSrc = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('os chip action', () => {
  it('uses the ghost sm sheet action as the chip recipe', () => {
    const source = readFileSync(join(appSrc, 'lib/os-chip-action.tsx'), 'utf8');
    expect(source).toContain("osChipActionClassName = 'os-chip-action'");
    expect(source).toContain('variant="ghost"');
    expect(source).toContain('size="sm"');
    expect(source).toContain('borderless');
    expect(source).toContain('OsSheetAction');
  });

  it('wires guild structure chips to OsChipAction', () => {
    const source = readFileSync(
      join(appSrc, 'features/guilds/guild-structure-settings-section.tsx'),
      'utf8'
    );
    expect(source).toContain('OsChipAction');
    expect(source).not.toContain('guild-secondary-button');
  });

  it('drops structure-only secondary chip CSS leftovers', () => {
    const css = readFileSync(join(appSrc, 'app/globals.css'), 'utf8');
    expect(css).not.toContain('.guild-structure-discovery-chip');
  });
});
