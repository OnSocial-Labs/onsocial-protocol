import { describe, expect, it } from 'vitest';
import { osAppAccent } from './os-app-accents';

describe('osAppAccent', () => {
  it('gives each launcher app its own hue', () => {
    expect(osAppAccent('home')).toBe('blue');
    expect(osAppAccent('activity')).toBe('gold');
    expect(osAppAccent('messages')).toBe('blue');
    expect(osAppAccent('discover')).toBe('blue');
    expect(osAppAccent('market')).toBe('amber');
    expect(osAppAccent('drops')).toBe('purple');
    expect(osAppAccent('events')).toBe('gold');
    expect(osAppAccent('collectibles')).toBe('green');
    expect(osAppAccent('hubs')).toBe('purple');
    expect(osAppAccent('groups')).toBe('purple');
    expect(osAppAccent('daos')).toBe('blue');
    expect(osAppAccent('page')).toBe('green');
    expect(osAppAccent('my-page')).toBe('green');
  });

  it('falls back to blue for an unknown app', () => {
    expect(osAppAccent('community:unknown')).toBe('blue');
  });
});
