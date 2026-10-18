import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

describe('MarketCreatorShop clear', () => {
  it('puts the hub-filter × on the far side of the shop row', () => {
    const shop = readFileSync(join(here, 'market-creator-shop.tsx'), 'utf8');
    const panel = readFileSync(join(here, 'market-page-panel.tsx'), 'utf8');
    const css = readFileSync(join(here, '../../app/globals.css'), 'utf8');
    const mainAt = shop.indexOf('standing-row-main');
    const clearAt = shop.indexOf('market-creator-shop-clear');
    expect(mainAt).toBeGreaterThan(-1);
    expect(clearAt).toBeGreaterThan(mainAt);
    expect(shop).not.toContain('nameTrailing');
    expect(shop).toContain('aria-label="Clear creator filter"');
    expect(shop).toContain(
      'className="market-creator-filter-clear market-creator-shop-clear"'
    );
    expect(shop).toContain('<MultiplyIcon aria-hidden />');
    expect(shop).not.toContain('>Clear<');
    expect(panel).toContain('onClear={clearNarrowFilter}');
    expect(panel).toContain('aria-label="Clear hub filter"');
    expect(css).toContain('.market-creator-filter-clear svg');
    expect(css).toContain('width: 0.85rem');
    expect(css).toContain('.market-creator-shop-clear');
    expect(css).toMatch(
      /\.market-creator-shop-clear \{[^}]*pointer-events: auto;/s
    );
  });
});
