import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AmountFieldMetaRow } from './amount-field-meta-row.js';
import { OsAccountField, osAccountFieldClassName } from './os-account-field.js';

const accountFieldCss = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../os-account-field.css'),
  'utf8'
);
const fieldCss = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../os-field.css'),
  'utf8'
);

describe('AmountFieldMetaRow', () => {
  it('exports the meta row', () => {
    expect(typeof AmountFieldMetaRow).toBe('function');
  });
});

describe('OsAccountField', () => {
  it('exports the account field shell', () => {
    expect(typeof OsAccountField).toBe('function');
    expect(osAccountFieldClassName).toBe('os-account-field');
  });

  it('paints status as one radius-clipped top lip', () => {
    expect(fieldCss).toMatch(/--os-field-lip:\s*var\(--protocol-green\);/);
    expect(fieldCss).toMatch(/--os-field-lip:\s*var\(--protocol-red\);/);
    expect(fieldCss).toMatch(
      /--os-field-lip:\s*var\(--protocol-amber,\s*#d97706\);/
    );
    expect(fieldCss).toMatch(/inset:\s*-1px;/);
    expect(fieldCss).toMatch(/padding:\s*2px 0 0;/);
    expect(fieldCss).toMatch(/mask-composite:\s*exclude;/);
    expect(fieldCss).toMatch(
      /\.os-field-soft:is\(\.is-available, \.is-taken, \.is-warn\)::after \{[^}]*inset:\s*0;/
    );
    expect(accountFieldCss).not.toMatch(/border-top-color:/);
    expect(accountFieldCss).not.toMatch(/border-color:\s*var\(--protocol-/);
  });
});
