import { describe, expect, it } from 'vitest';
import {
  guildPath,
  guildSheetPath,
  manageSheetFromShare,
  parseGuildProposalParam,
  parseGuildSheetParam,
} from '@/features/guilds/guilds-data';

describe('guild share sheet paths', () => {
  it('parses known sheet ids and rejects anything else', () => {
    expect(parseGuildSheetParam('proposals')).toBe('proposals');
    expect(parseGuildSheetParam('Members')).toBe('members');
    expect(parseGuildSheetParam(' requests ')).toBe('requests');
    expect(parseGuildSheetParam('settings')).toBe('settings');
    expect(parseGuildSheetParam('')).toBeNull();
    expect(parseGuildSheetParam(null)).toBeNull();
  });

  it('builds shareable home URLs for live sheets', () => {
    expect(guildPath('rebels.near')).toBe('/groups/rebels.near');
    expect(guildSheetPath('rebels.near', 'proposals')).toBe(
      '/groups/rebels.near?sheet=proposals'
    );
    expect(guildSheetPath('a/b', 'members')).toBe(
      '/groups/a%2Fb?sheet=members'
    );
    expect(guildSheetPath('rebels.near', 'settings')).toBe(
      '/groups/rebels.near?sheet=settings'
    );
  });

  it('appends a proposal deep-link param when given one', () => {
    expect(
      guildSheetPath('rebels.near', 'proposals', { proposal: 12 })
    ).toBe('/groups/rebels.near?sheet=proposals&proposal=12');
    expect(
      guildSheetPath('rebels.near', 'proposals', { proposal: ' prop-1 ' })
    ).toBe('/groups/rebels.near?sheet=proposals&proposal=prop-1');
    expect(
      guildSheetPath('rebels.near', 'proposals', { proposal: null })
    ).toBe('/groups/rebels.near?sheet=proposals');
    expect(guildSheetPath('rebels.near', 'proposals', { proposal: '' })).toBe(
      '/groups/rebels.near?sheet=proposals'
    );
    expect(guildSheetPath('rebels.near', 'proposals')).toBe(
      '/groups/rebels.near?sheet=proposals'
    );
  });

  it('parses the proposal deep-link param', () => {
    expect(parseGuildProposalParam('12')).toBe('12');
    expect(parseGuildProposalParam(' prop-1 ')).toBe('prop-1');
    expect(parseGuildProposalParam('')).toBeNull();
    expect(parseGuildProposalParam('   ')).toBeNull();
    expect(parseGuildProposalParam(null)).toBeNull();
    expect(parseGuildProposalParam(undefined)).toBeNull();
  });

  it('keeps settings off the manage-sheet stack', () => {
    expect(manageSheetFromShare('members')).toBe('members');
    expect(manageSheetFromShare('proposals')).toBe('proposals');
    expect(manageSheetFromShare('requests')).toBe('requests');
    expect(manageSheetFromShare('settings')).toBeNull();
    expect(manageSheetFromShare(null)).toBeNull();
  });
});
