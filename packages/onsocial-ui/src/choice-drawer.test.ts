import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  choiceDrawerHasPersistedSelection,
  osChoiceChipClassName,
  osChoiceSheetBodyClassName,
  osChoiceSheetPanelClassName,
} from './choice-drawer.js';
import {
  osActionDrawerConfirmCancelClassName,
  osActionDrawerConfirmClassName,
  osActionDrawerIconClassName,
} from './action-drawer.js';

const actionDrawerSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'action-drawer.tsx'),
  'utf8'
);

describe('choiceDrawerHasPersistedSelection', () => {
  it('treats empty token ids as a valid persisted selection', () => {
    const options = [
      { value: '', label: 'NEAR' },
      { value: 'social.testnet', label: 'SOCIAL' },
    ] as const;

    expect(choiceDrawerHasPersistedSelection('', options)).toBe(true);
    expect(choiceDrawerHasPersistedSelection('social.testnet', options)).toBe(
      true
    );
    expect(choiceDrawerHasPersistedSelection('missing', options)).toBe(false);
  });
});

describe('choice / action drawer class names', () => {
  it('exports stable class names', () => {
    expect(osChoiceChipClassName).toBe('os-choice-chip');
    expect(osChoiceSheetPanelClassName).toBe('os-choice-sheet-panel');
    expect(osChoiceSheetBodyClassName).toBe('os-choice-sheet-body');
    expect(osActionDrawerIconClassName).toBe('os-action-drawer-icon');
    expect(osActionDrawerConfirmClassName).toBe('os-action-drawer-confirm');
    expect(osActionDrawerConfirmCancelClassName).toBe(
      'os-action-drawer-confirm-cancel'
    );
  });

  it('keeps confirm children and still lists items when both are set', () => {
    expect(actionDrawerSrc).toContain('{children}');
    expect(actionDrawerSrc).toContain('items && items.length > 0');
    expect(actionDrawerSrc).toContain('chrome="choice"');
  });
});
