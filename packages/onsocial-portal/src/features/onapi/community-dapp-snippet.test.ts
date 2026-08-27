import { describe, expect, it } from 'vitest';
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
  });

  it('rejects an invalid continue app id', () => {
    expect(() =>
      communityDappContinueUrl('https://onsocial.id', '../x')
    ).toThrow(/appId/);
  });
});
