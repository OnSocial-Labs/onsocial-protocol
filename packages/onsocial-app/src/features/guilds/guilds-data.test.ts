import { describe, expect, it } from 'vitest';
import {
  guildPath,
  guildProposalPath,
  guildSheetPath,
  parseGuildProposalParam,
  parseGuildSheetParam,
} from '@/features/guilds/guilds-data';

describe('guild share sheet paths', () => {
  it('parses known sheet ids and rejects anything else', () => {
    expect(parseGuildSheetParam('proposals')).toBe('proposals');
    expect(parseGuildSheetParam('Members')).toBe('members');
    expect(parseGuildSheetParam(' requests ')).toBe('requests');
    expect(parseGuildSheetParam('settings')).toBeNull();
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
    expect(guildProposalPath('rebels.near', '12')).toBe(
      '/groups/rebels.near?sheet=proposals&proposal=12'
    );
    expect(parseGuildProposalParam(' 12 ')).toBe('12');
    expect(parseGuildProposalParam('')).toBeNull();
  });
});
