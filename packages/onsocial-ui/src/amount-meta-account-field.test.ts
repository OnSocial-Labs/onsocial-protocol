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

  it('colors the field border instead of a second inset line', () => {
    expect(accountFieldCss).toMatch(
      /\.os-account-field\.is-available:focus-within[\s\S]*?border-color:\s*var\(--protocol-green\);/
    );
    expect(accountFieldCss).toMatch(
      /\.os-account-field\.is-taken:focus-within[\s\S]*?border-color:\s*var\(--protocol-red\);/
    );
    expect(accountFieldCss).toMatch(
      /\.os-account-field\.is-warn:focus-within[\s\S]*?border-color:\s*var\(--protocol-amber,\s*#d97706\);/
    );
    const bordered = accountFieldCss.split('Soft chrome has no border')[0];
    expect(bordered).not.toMatch(
      /box-shadow:\s*inset 0 1px 0 var\(--protocol-/
    );
  });
});
