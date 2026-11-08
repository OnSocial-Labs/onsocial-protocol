import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { APP_LOCALES } from './locale';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../messages');
const en = JSON.parse(readFileSync(join(root, 'en/shell.json'), 'utf8'));
const pl = JSON.parse(readFileSync(join(root, 'pl/shell.json'), 'utf8'));

function keys(value: unknown, prefix = ''): string[] {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(value as Record<string, unknown>).flatMap(
      ([key, child]) => keys(child, prefix ? `${prefix}.${key}` : key)
    );
  }
  return [prefix];
}

describe('shell catalogs', () => {
  it('gives Polish every English key', () => {
    expect(keys(pl).sort()).toEqual(keys(en).sort());
  });

  it('keeps the English shell sentences the product already uses', () => {
    expect(en.apps.home).toBe('Home');
    expect(en.apps.groups).toBe('Guilds');
    expect(en.launcher.open).toBe('Open launcher');
    expect(en.launcher.close).toBe('Close launcher');
    expect(en.dock.connect).toBe('Connect');
    expect(en.dock.back).toBe('Back');
    expect(en.account.opening).toBe('Opening…');
    expect(en.account.found).toBe('Found');
    expect(en.account.taken).toBe('Taken');
    expect(en.account.available).toBe('Available');
    expect(en.account.missing).toBe('Not found');
    expect(en.theme.light).toBe('Light');
    expect(en.theme.dark).toBe('Dark');
    expect(en.peekOverflow).toBe('{count, plural, other {# more in {place}}}');
  });

  it('lists every locale under its own name in every catalog', () => {
    expect(en.language.en).toBe('English');
    expect(en.language.pl).toBe('Polski');
    for (const code of APP_LOCALES) {
      expect(pl.language[code]).toBe(en.language[code]);
    }
  });
});
