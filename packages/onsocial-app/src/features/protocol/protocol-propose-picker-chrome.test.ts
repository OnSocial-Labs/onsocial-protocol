import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const picker = readFileSync(join(here, 'protocol-picker-sheet.tsx'), 'utf8');
const proposeKind = readFileSync(
  join(here, 'protocol-propose-kind-sheet.tsx'),
  'utf8'
);
const create = readFileSync(join(here, 'protocol-create-sheet.tsx'), 'utf8');
const task = readFileSync(join(here, 'protocol-task-sheet.tsx'), 'utf8');
const globalsCss = readFileSync(join(here, '../../app/globals.css'), 'utf8');

describe('Propose picker + create chrome', () => {
  it('hugs the kind picker with a wallet-like standard cap', () => {
    expect(picker).toContain('PROTOCOL_PICKER_LAYOUT');
    expect(picker).toContain('os-sheet-cap-standard');
    expect(picker).toContain('sizing="hug"');
    expect(picker).not.toContain('peekRatio={0.9}');
    expect(picker).not.toContain("initialDetent='peek'");
    expect(proposeKind).not.toContain('resolveProtocolPickerSheetLayout');
    expect(proposeKind).not.toContain('peekRatio');
    expect(globalsCss).toContain('.protocol-picker-sheet-body');
    expect(globalsCss).not.toContain('protocol-picker-sheet-body.is-long');
  });

  it('uses compact gesture chrome for short create kinds', () => {
    expect(create).toContain('isProtocolCreateCompactKind(kind)');
    expect(create).toContain("size={isProtocolCreateCompactKind(kind) ? 'compact' : 'tall'}");
    expect(task).toContain('size = \'tall\'');
    expect(task).toContain('size={size}');
    expect(task).not.toContain('OsPageSheet');
  });
});
