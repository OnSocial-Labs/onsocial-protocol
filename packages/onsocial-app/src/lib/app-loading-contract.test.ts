import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  APP_LOADING_MATRIX,
  type AppLoadingFamily,
} from '@/lib/app-loading-matrix';
import {
  resolveAppLoadingPresentation,
  type AppLoadingPhase,
} from '@/lib/app-loading-contract';

const appSrc = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('app loading contract', () => {
  it.each([
    ['cold', false, 'skeleton'],
    ['refreshing', false, 'skeleton'],
    ['refreshing', true, 'preserve'],
    ['appending', false, 'append-skeleton'],
    ['appending', true, 'append-skeleton'],
    ['empty', false, 'state'],
    ['error', false, 'state'],
    ['error', true, 'overlay'],
  ] as const)(
    '%s with painted rows=%s resolves to %s',
    (phase, hasPaintedRows, expected) => {
      expect(
        resolveAppLoadingPresentation(phase, { hasPaintedRows })
      ).toBe(expected);
    }
  );

  it('does not allow the error contract to blank painted rows', () => {
    expect(resolveAppLoadingPresentation('error', { hasPaintedRows: true })).toBe(
      'overlay'
    );
  });
});

describe('app loading matrix', () => {
  it('covers the primary page families without duplicate routes or ids', () => {
    const ids = APP_LOADING_MATRIX.map((page) => page.id);
    const routes = APP_LOADING_MATRIX.map((page) => page.route);
    const families: AppLoadingFamily[] = [
      'glass-list',
      'immersive-detail',
      'sheet-form',
      'private',
    ];

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(routes).size).toBe(routes.length);
    expect(APP_LOADING_MATRIX).toHaveLength(9);
    expect(APP_LOADING_MATRIX.every((page) => families.includes(page.family))).toBe(
      true
    );
  });

  it('keeps every matrix implementation reference present', () => {
    for (const page of APP_LOADING_MATRIX) {
      for (const relativePath of page.implementationFiles) {
        expect(existsSync(join(appSrc, relativePath)), relativePath).toBe(true);
      }
    }
  });

  it('requires every page to define all transition states', () => {
    const phases = [
      'cold',
      'refreshing',
      'appending',
      'empty',
      'error',
    ] as const satisfies readonly AppLoadingPhase[];

    for (const page of APP_LOADING_MATRIX) {
      for (const phase of phases) {
        expect(page[phase], `${page.id}.${phase}`).toBeTruthy();
      }
      expect(page.routeFallback, `${page.id}.routeFallback`).toBeTruthy();
    }
  });
});
