import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

describe('MarketCreatorShop clear', () => {
  it('puts the hub-filter × on the name under Shop', () => {
    const shop = readFileSync(join(here, 'market-creator-shop.tsx'), 'utf8');
    const panel = readFileSync(join(here, 'market-page-panel.tsx'), 'utf8');
    const css = readFileSync(join(here, '../../app/globals.css'), 'utf8');
    const shopAt = shop.indexOf('market-creator-shop-role');
    const clearAt = shop.indexOf('market-creator-shop-clear');
    expect(shopAt).toBeGreaterThan(-1);
    expect(clearAt).toBeGreaterThan(shopAt);
    expect(shop).toContain('nameTrailing=');
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
