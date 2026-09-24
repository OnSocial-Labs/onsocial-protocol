import { describe, expect, it } from 'vitest';
import { osAppAccent } from '@/lib/os-app-accents';

describe('osAppAccent', () => {
  it('matches the dock colors for drops, collectibles, and attention', () => {
    expect(osAppAccent('drops')).toBe('purple');
    expect(osAppAccent('collectibles')).toBe('green');
    expect(osAppAccent('activity')).toBe('gold');
    expect(osAppAccent('hubs')).toBe('purple');
    expect(osAppAccent('daos')).toBe('blue');
    expect(osAppAccent('messages')).toBe('blue');
    expect(osAppAccent('market')).toBe('amber');
    expect(osAppAccent('page')).toBe('green');
  });
});
