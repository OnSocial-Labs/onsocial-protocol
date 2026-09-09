import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { osAppChromePageClassName } from '@onsocial/ui';
import {
  DAO_CREATE_FORM_CLASS,
  DROP_CREATE_FORM_CLASS,
  GUILD_CREATE_FORM_CLASS,
  HUB_CREATE_FORM_CLASS,
  osCreatePageClassName,
} from '@/lib/os-create-page';

const appSrc = join(dirname(fileURLToPath(import.meta.url)), '..');

const CREATE_FORM_CLASSES = [
  GUILD_CREATE_FORM_CLASS,
  HUB_CREATE_FORM_CLASS,
  DAO_CREATE_FORM_CLASS,
  DROP_CREATE_FORM_CLASS,
] as const;

describe('os create page', () => {
  it('uses the UI chrome page class as the only inset root', () => {
    expect(osCreatePageClassName('dao-create-form')).toBe(
      `${osAppChromePageClassName} dao-create-form`
    );
    expect(osAppChromePageClassName).toBe('os-app-chrome-page');
  });

  it('puts every create place on the chrome page inset', () => {
    for (const className of CREATE_FORM_CLASSES) {
      expect(className.split(' ')[0]).toBe(osAppChromePageClassName);
    }
    expect(GUILD_CREATE_FORM_CLASS).toContain('guild-create-form');
    expect(HUB_CREATE_FORM_CLASS).toContain('hub-create-form');
    expect(DAO_CREATE_FORM_CLASS).toContain('dao-create-form');
    expect(DROP_CREATE_FORM_CLASS).toContain('drop-create-form');
  });

  it('wires create panels to the shared form classes', () => {
    const wiring = [
      ['features/guilds/guild-create-panel.tsx', 'GUILD_CREATE_FORM_CLASS'],
      ['features/scarces/create-app-panel.tsx', 'HUB_CREATE_FORM_CLASS'],
      ['features/protocol/dao-create-panel.tsx', 'DAO_CREATE_FORM_CLASS'],
      ['features/scarces/create-drop-panel.tsx', 'DROP_CREATE_FORM_CLASS'],
    ] as const;
    for (const [file, token] of wiring) {
      expect(readFileSync(join(appSrc, file), 'utf8')).toContain(token);
    }
  });
});
