import { describe, expect, it } from 'vitest';
import { AmountFieldMetaRow } from './amount-field-meta-row.js';
import { OsAccountField, osAccountFieldClassName } from './os-account-field.js';

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
});
