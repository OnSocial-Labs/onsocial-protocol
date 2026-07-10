import { describe, expect, it } from 'vitest';
import {
  guildFallbackCoverStyle,
  guildFallbackPalette,
  hashGuildSeed,
} from '@/features/guilds/guild-visual';

describe('guild-visual fallback', () => {
  it('hashes the same guild id stably', () => {
    expect(hashGuildSeed('grp_md_perm_1779813274071_ojf237')).toBe(
      hashGuildSeed('grp_md_perm_1779813274071_ojf237')
    );
  });

  it('gives different guilds different fallback palettes', () => {
    const a = guildFallbackPalette('grp_md_perm_1779813274071_ojf237');
    const b = guildFallbackPalette('grp_md_perm_1779813138021_rcvcpf');
    expect(a).not.toEqual(b);
  });

  it('exposes a single accent wash for fallback covers', () => {
    const style = guildFallbackCoverStyle('Social Rebels #1');
    expect(style['--guild-fallback-accent' as keyof typeof style]).toBeTruthy();
    expect(style['--guild-fallback-spot-x' as keyof typeof style]).toMatch(
      /%$/
    );
    expect(
      style['--guild-fallback-a' as keyof typeof style]
    ).toBeUndefined();
  });
});
