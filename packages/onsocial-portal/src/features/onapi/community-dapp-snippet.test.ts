import { describe, expect, it } from 'vitest';
import { getSdkMethodGuide } from '@/data/sdk-method-guides';
import {
  communityDappContinueUrl,
  communityDappSnippet,
} from './community-dapp-snippet';

describe('community dapp snippet', () => {
  it('embeds the app id and continue URL', () => {
    const snippet = communityDappSnippet({
      appId: 'Tracker',
      osOrigin: 'https://onsocial.id/',
      network: 'mainnet',
    });
    expect(snippet).toContain('completeAppHandoff');
    expect(snippet).toContain('isAppHandoffRedirect');
    expect(snippet).toContain('apps/tracker/item/');
    expect(snippet).toContain('osOrigin: "https://onsocial.id"');
    expect(communityDappContinueUrl('https://onsocial.id/', 'Tracker')).toBe(
      'https://onsocial.id/handoff?app=tracker'
    );
    expect(
      getSdkMethodGuide('advanced-control')?.notes.join(' ')
    ).toMatch(/AppHandoffRedirect/);
  });

  it('rejects an invalid continue app id', () => {
    expect(() =>
      communityDappContinueUrl('https://onsocial.id', '../x')
    ).toThrow(/appId/);
  });
});
