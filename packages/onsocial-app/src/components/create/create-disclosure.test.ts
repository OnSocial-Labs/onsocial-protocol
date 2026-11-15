import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = dirname(fileURLToPath(import.meta.url));
const appSrc = join(root, '../..');

describe('create disclosure', () => {
  it('is shared by drop / hub / guild / DAO create', () => {
    const src = readFileSync(join(root, 'create-disclosure.tsx'), 'utf8');
    expect(src).toContain('export function CreateDisclosure');
    expect(src).toContain('export function CreateRevealPanel');
    expect(src).toContain('export function useCreateReveal');
    expect(src).toContain('useOsReveal');
    expect(src).toContain('create-disclosure-chevron');

    for (const [file, token] of [
      ['features/scarces/create-drop-panel.tsx', 'CreateDisclosure'],
      ['features/scarces/create-app-panel.tsx', 'CreateRevealPanel'],
      ['features/guilds/guild-create-panel.tsx', 'useCreateReveal'],
      ['features/protocol/dao-create-panel.tsx', 'DAO_CREATE_DEFAULT_POLICY'],
    ] as const) {
      expect(readFileSync(join(appSrc, file), 'utf8')).toContain(token);
    }
  });

  it('DAO create shows Default policy facts, not Advanced', () => {
    const create = readFileSync(
      join(appSrc, 'features/protocol/dao-create-panel.tsx'),
      'utf8'
    );
    expect(create).toContain('SheetFactSection');
    expect(create).toContain('SheetFactRow');
    expect(create).toContain('daoFactoryCreatePolicyFacts');
    expect(create).not.toContain('DAO_CREATE_ADVANCED');
    expect(create).not.toContain('You get');
    expect(create).not.toContain('dao-create-facts');
  });
});
