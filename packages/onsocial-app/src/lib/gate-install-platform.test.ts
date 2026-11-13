import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { gateInstallPlatform } from '@/lib/gate-install-platform';
import { gateViewportScript } from '@/lib/gate-viewport';

const appSrc = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('gateInstallPlatform', () => {
  it('treats iPhone, iPad, and iPod as the Share hint', () => {
    expect(
      gateInstallPlatform(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'
      )
    ).toBe('ios');
    expect(
      gateInstallPlatform('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')
    ).toBe('ios');
    expect(
      gateInstallPlatform(
        'Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X)'
      )
    ).toBe('ios');
  });

  it('reserves the slot for Android and desktop', () => {
    expect(
      gateInstallPlatform(
        'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile'
      )
    ).toBe('other');
    expect(
      gateInstallPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')
    ).toBe('other');
    expect(gateInstallPlatform('')).toBe('other');
  });
});

describe('gate viewport script', () => {
  it('tracks resize, orientation, and the visual viewport', () => {
    expect(gateViewportScript).toContain('visualViewport');
    expect(gateViewportScript).toContain("addEventListener('resize'");
    expect(gateViewportScript).toContain(
      "addEventListener('orientationchange'"
    );
    expect(gateViewportScript).toContain("addEventListener('scroll'");
    expect(gateViewportScript).toContain('--gate-viewport-height');
    expect(gateViewportScript).toContain('--gate-viewport-offset');
    expect(gateViewportScript).toContain('data-pwa-standalone');
  });
});

describe('gate button contract', () => {
  it('paints install as the kit text button and reserves the slot', () => {
    const source = readFileSync(
      join(appSrc, 'components/gate/gate-pwa-install.tsx'),
      'utf8'
    );
    expect(source).toContain('osCommitCancelClassName');
    expect(source).toContain('gate-install-reserve');
    expect(source).toContain('Install app');
    expect(source).toContain('Share → Add to Home Screen');
    expect(source).not.toContain('OsSheetAction');
    expect(source).not.toContain('gate-connect-install"');
    expect(source).not.toContain('isIos');
  });

  it('keeps the rail inside the scroll region and the actions on tokens', () => {
    const css = readFileSync(join(appSrc, 'app/globals.css'), 'utf8');
    const gateStart = css.indexOf(
      '/* ─── Gate (landing / shared center layout)'
    );
    const gateEnd = css.indexOf('/* ─── Not-found page', gateStart);
    const gate = css.slice(gateStart, gateEnd);
    expect(gate).toContain('min-height: 0');
    expect(gate).toContain('var(--gate-viewport-height, 100dvh)');
    expect(gate).toContain('env(safe-area-inset-top, 0px)');
    expect(gate).toContain('env(safe-area-inset-bottom, 0px)');
    expect(gate).not.toContain('gate-fade');
    expect(gate).toContain('var(--os-dock-clearance-gap)');
    expect(gate).toContain('var(--os-icon-hit)');
    expect(gate).toContain('touch-action: pan-y');
    expect(gate).toContain('overscroll-behavior: contain');
    expect(gate).toContain('var(--gate-viewport-offset, 0px)');
    expect(gate).not.toContain('opacity: 0.72');
    expect(gate).not.toContain('backdrop-filter: blur(12px)');
    expect(gate).not.toContain('.gate-connect-button.gate-connect-install');

    const pillStart = css.indexOf('.os-dock-pill.gate-connect-button {');
    const pillEnd = css.indexOf(
      '.os-dock-pill.portfolio-summon::before',
      pillStart
    );
    const pill = css.slice(pillStart, pillEnd);
    expect(pill).toContain('background: var(--os-dock-fill)');
    expect(pill).toContain('appearance: none');
    expect(pill).toContain('content: none');
    expect(pill).not.toContain('backdrop-filter: blur(20px)');
  });
});
