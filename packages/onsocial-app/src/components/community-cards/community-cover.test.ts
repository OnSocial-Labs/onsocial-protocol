import { describe, expect, it } from 'vitest';
import {
  hashPlaceSeed,
  placeFallbackCoverStyle,
  placeFallbackPalette,
} from '@/components/community-cards/community-cover';
import {
  guildFallbackCoverStyle,
  guildFallbackPalette,
  hashGuildSeed,
} from '@/features/guilds/guild-visual';

describe('place cover fallback', () => {
  it('hashes the same id stably', () => {
    expect(hashPlaceSeed('grp_md_perm_1779813274071_ojf237')).toBe(
      hashPlaceSeed('grp_md_perm_1779813274071_ojf237')
    );
    expect(hashGuildSeed('grp_md_perm_1779813274071_ojf237')).toBe(
      hashPlaceSeed('grp_md_perm_1779813274071_ojf237')
    );
  });

  it('gives different places different fallback palettes', () => {
    const a = placeFallbackPalette('grp_md_perm_1779813274071_ojf237');
    const b = placeFallbackPalette('grp_md_perm_1779813138021_rcvcpf');
    expect(a).not.toEqual(b);
    expect(guildFallbackPalette('grp_md_perm_1779813274071_ojf237')).toEqual(a);
  });

  it('exposes a single accent wash for fallback covers', () => {
    const style = placeFallbackCoverStyle('Social Rebels #1');
    expect(style['--guild-fallback-accent' as keyof typeof style]).toBeTruthy();
    expect(style['--guild-fallback-spot-x' as keyof typeof style]).toMatch(
      /%$/
    );
    expect(
      style['--guild-fallback-a' as keyof typeof style]
    ).toBeUndefined();
    expect(guildFallbackCoverStyle('Social Rebels #1')).toEqual(style);
  });
});
