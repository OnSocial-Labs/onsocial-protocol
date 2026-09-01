import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const globalsCss = readFileSync(join(here, '../../app/globals.css'), 'utf8');
const surfaceCss = readFileSync(
  join(here, '../../../../onsocial-ui/os-surface-interactive.css'),
  'utf8'
);

describe('mood ink chrome', () => {
  it('defines --mood-ink on mood surfaces as chrome alias', () => {
    expect(globalsCss).toContain(
      '--mood-ink: var(--mood-accent-chrome, var(--mood-accent));'
    );
    expect(globalsCss).toContain(
      '--os-surface-row-hover: color-mix(in srgb, var(--mood-ink) 6%, transparent);'
    );
    expect(globalsCss).toContain('--os-chip-selected-ink: var(--mood-ink);');
  });

  it('tints reply / quote / boost with --mood-ink', () => {
    expect(globalsCss).toContain('.post-card-stat--reply:hover:not(:disabled)');
    expect(globalsCss).toContain('.post-card-stat--quote.is-active');
    expect(globalsCss).toContain('.post-card-amplify.is-active');
    expect(globalsCss).toMatch(
      /Mood identity chrome[\s\S]*color: var\(--mood-ink/
    );
  });

  it('selected chips consume remappable tokens; ready stays protocol green', () => {
    expect(surfaceCss).toContain('color: var(--os-chip-selected-ink);');
    expect(surfaceCss).toContain(
      '--os-chip-selected-ink: var(--protocol-green-ink, var(--protocol-green));'
    );
    expect(surfaceCss).toMatch(
      /\.os-surface-chip\.is-ready \{\s*[\s\S]*?color: var\(--protocol-green-ink/
    );
  });

  it('hand-rolled selected pills consume the same remappable tokens', () => {
    expect(globalsCss).toMatch(
      /\.drop-cal-chip\.is-selected \{\s*background: var\(--os-chip-selected-fill\);\s*color: var\(--os-chip-selected-ink\);/
    );
    expect(globalsCss).toMatch(
      /\.drop-cal-day\.is-selected \{\s*background: var\(--os-chip-selected-fill\);\s*color: var\(--os-chip-selected-ink\);/
    );
    expect(globalsCss).toMatch(
      /\.app-access-option\.is-selected \{\s*background: var\(--os-chip-selected-fill\);\s*color: var\(--os-chip-selected-ink\);/
    );
    expect(globalsCss).toContain(
      'border-color: color-mix(\n      in srgb,\n      var(--os-chip-selected-ink) 90%'
    );
  });

  it('discover trending chips follow --signal-reputation like browse topics', () => {
    expect(globalsCss).toMatch(
      /\.discover-trending-chip \{\s*[\s\S]*?color: var\(\s*--signal-reputation/
    );
    expect(globalsCss).toMatch(
      /\.discover-tab-bar--browse button \{\s*[\s\S]*?color: var\(\s*--signal-reputation/
    );
  });

  it('keeps like crimson and love / player protocol green', () => {
    expect(globalsCss).toMatch(
      /\.post-card-react\.is-active \{\s*color: var\(--protocol-red\);/
    );
    expect(globalsCss).toMatch(
      /\.scarce-clip-track-love\.is-loved \{\s*color: var\(--protocol-green/
    );
    expect(globalsCss).toMatch(
      /\.scarce-clip-progress-fill \{\s*[\s\S]*?background: color-mix\(in srgb, var\(--protocol-green\)/
    );
  });
});
