import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appSrc = join(dirname(fileURLToPath(import.meta.url)), '..');

const leftoverEmptyClasses = [
  'app-soon-link',
  'MarketEmptyAction',
  'className="standing-panel-empty-action"',
  'portfolio-writing-empty-action',
  'market-page-retry',
  'standing-panel-error-retry',
  'endorsements-retry',
  'launcher-home-retry',
  'profile-support-retry',
] as const;

const emptyActionWiring = [
  'components/panels/list-load-error.tsx',
  'components/panels/standing-panel-content.tsx',
  'components/panels/endorsements-panel.tsx',
  'components/portfolio/portfolio-writing-panel.tsx',
  'components/portfolio/page-drawer-store.tsx',
  'components/portfolio/profile-support-form.tsx',
  'components/panels/endorsement-support-form.tsx',
  'components/launcher-home/launcher-home-empty.tsx',
  'features/home/post-amplify-form.tsx',
  'features/market/market-page-panel.tsx',
  'features/collectibles/collectibles-page-panel.tsx',
  'features/collectibles/collectibles-play-panel.tsx',
  'features/drops/drops-page-panel.tsx',
  'features/discover/discover-panel-content.tsx',
  'features/discover/discover-hubs-panel.tsx',
  'features/discover/discover-guilds-panel.tsx',
  'features/discover/discover-daos-panel.tsx',
  'features/guilds/guild-members-roster.tsx',
  'features/scarces/collection-page-panel.tsx',
  'features/scarces/app-page-panel.tsx',
  'features/scarces/series-page-panel.tsx',
  'features/scarces/ticket-door-page-panel.tsx',
] as const;

describe('os empty action', () => {
  it('uses the borderless sm sheet action as the only empty CTA', () => {
    const source = readFileSync(
      join(appSrc, 'lib/os-empty-action.tsx'),
      'utf8'
    );
    expect(source).toContain("osEmptyActionClassName = 'os-empty-action'");
    expect(source).toContain('size="sm"');
    expect(source).toContain('borderless');
    expect(source).toContain('frosted-primary');
    expect(source).toContain('row-compact');
  });

  it('wires empties and list retries to OsEmptyAction', () => {
    for (const file of emptyActionWiring) {
      const source = readFileSync(join(appSrc, file), 'utf8');
      expect(
        source.includes('OsEmptyAction') || source.includes('ListLoadError')
      ).toBe(true);
    }
    expect(
      readFileSync(join(appSrc, 'components/panels/list-load-error.tsx'), 'utf8')
    ).toContain('OsEmptyAction');
  });

  it('drops leftover empty and retry classes from recoveries', () => {
    for (const file of emptyActionWiring) {
      const source = readFileSync(join(appSrc, file), 'utf8');
      for (const leftover of leftoverEmptyClasses) {
        expect(source).not.toContain(leftover);
      }
    }
    const globals = readFileSync(join(appSrc, 'app/globals.css'), 'utf8');
    expect(globals).not.toContain('.app-soon-link');
    expect(globals).not.toContain('.standing-panel-empty-action {');
    expect(globals).not.toContain('.portfolio-writing-empty-action');
    expect(globals).not.toContain('.market-page-retry');
    expect(globals).not.toContain('.standing-panel-error-retry');
    expect(globals).not.toContain('.endorsements-retry');
    expect(globals).not.toContain('.launcher-home-retry');
    expect(globals).not.toContain('.profile-support-retry');
    expect(globals).not.toContain('.app-reward-toast');
  });

  it('toasts DM recovery copy instead of succeeded morph', () => {
    const source = readFileSync(
      join(appSrc, 'features/messages/dm-recovery-code-sheet.tsx'),
      'utf8'
    );
    expect(source).not.toContain('succeededLabel');
    expect(source).not.toContain('succeeded={');
    expect(source).toContain('txToastSuccess.recoveryCodeCopied');
    expect(source).toContain('txToastError.recoveryCodeCopyFailed');
  });
});
