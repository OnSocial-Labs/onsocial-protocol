import { createRequire } from 'node:module';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { APP_LOCALES } from './locale';
import { SHELL_HOME_FALLBACKS } from './shell-label';

const require = createRequire(
  realpathSync(
    new URL('../../node_modules/next-intl/package.json', import.meta.url)
  )
);
const { createTranslator } = require('use-intl') as {
  createTranslator: (config: {
    locale: string;
    messages: Record<string, unknown>;
    namespace: string;
  }) => (key: string, values?: Record<string, string | number>) => string;
};

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
    expect(en.dock.swipeHint).toBe('Swipe up · hold for apps');
    expect(en.dock.swipeHold).toBe('Swipe up for page content. Hold for apps.');
    expect(en.homeEmpty.nothingNew).toBe('Nothing new right now.');
    expect(en.homeEmpty.guildsNone).toBe(
      'You haven’t joined a guild yet. Tap Search to explore, or + to start one.'
    );
    expect(en.homeChrome.latest).toBe('Latest');
    expect(en.homeChrome.createGuild).toBe('Create guild');
    expect(en.homeChrome.openHub).toBe('Open a hub');
    expect(en.homeChrome.createDao).toBe('Create DAO');
    expect(en.face.message).toBe('Message');
    expect(en.face.messageNamed).toBe('Message {name}');
    expect(en.create.name).toBe('Name');
    expect(en.create.hubSubmit).toBe('Open hub');
    expect(en.create.tokenCreate).toBe('Create');
    expect(en.create.discardLookBody).toBe(
      'Name, ID, look, and about won’t be saved.'
    );
    expect(en.look.addBanner).toBe('Add banner');
    expect(en.look.photoOrVideo).toBe('Photo or video');
  });

  it('renders escaped apostrophes as the field placeholder', () => {
    const t = createTranslator({
      locale: 'en',
      messages: en,
      namespace: 'create',
    });
    expect(t('guildAboutPlaceholder')).toBe(
      "What this guild does and who it's for."
    );
    expect(t('hubAboutPlaceholder')).toBe(
      "What this hub publishes and who it's for."
    );
    expect(t('daoWhisper', { near: '0.1' })).toBe(
      'You start as council · ~0.1 NEAR'
    );
  });

  it('maps each launcher error fallback onto its English sentence', () => {
    for (const [sentence, key] of Object.entries(SHELL_HOME_FALLBACKS)) {
      const [group, name] = key.split('.');
      expect(en[group][name]).toBe(sentence);
    }
  });

  it('lists every locale under its own name in every catalog', () => {
    expect(en.language.en).toBe('English');
    expect(en.language.pl).toBe('Polski');
    for (const code of APP_LOCALES) {
      expect(pl.language[code]).toBe(en.language[code]);
    }
  });
});
