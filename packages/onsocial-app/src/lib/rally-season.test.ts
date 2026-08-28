import { describe, expect, it } from 'vitest';
import { txToastSuccess } from '@/lib/transaction-toast-copy';
import {
  formatRallyMarkCaption,
  parseJoinRallyMinYocto,
  rallyPortalPath,
  resolveRallyLifecyclePhase,
  resolveRallyOccasion,
  resolveRallyPresentation,
} from '@/lib/rally-season';

describe('rally-season', () => {
  it('shows a live occasion and hides archived-only registries', () => {
    expect(
      resolveRallyOccasion({
        live: {
          seasonId: 'season-one',
          label: 'OnSocial Rally',
          phase: 'live',
          is_live: true,
          claim_open: false,
        },
        upcoming: null,
        claim: null,
        seasons: [],
        resolvedActiveSeasonId: 'season-one',
      })?.seasonId
    ).toBe('season-one');
    expect(
      resolveRallyOccasion({
        live: null,
        upcoming: {
          seasonId: 'season-two',
          label: 'Soon',
          phase: 'upcoming',
          is_live: false,
          claim_open: false,
        },
        claim: null,
        seasons: [],
        resolvedActiveSeasonId: 'season-two',
      })
    ).toBeNull();
    expect(
      resolveRallyOccasion({
        live: null,
        upcoming: null,
        claim: {
          seasonId: 'season-zero',
          label: 'Genesis Rally',
          phase: 'claim',
          is_live: false,
          claim_open: true,
        },
        seasons: [],
        resolvedActiveSeasonId: null,
      })?.seasonId
    ).toBe('season-zero');
  });

  it('resolves claim_open after a published settlement', () => {
    expect(
      resolveRallyLifecyclePhase(
        {
          label: 'OnSocial Rally',
          active: true,
          starts_at_ns: '1',
          ends_at_ns: '2',
          is_live: false,
          claim_open: true,
        },
        { status: 'published', publishedTxHash: 'abc' }
      )
    ).toBe('claim_open');
  });

  it('parses join min and titles', () => {
    expect(parseJoinRallyMinYocto({ min_amount: '100000000000000000000' })).toBe(
      100000000000000000000n
    );
    expect(resolveRallyPresentation('season-one').pageTitle).toBe(
      'OnSocial Rally'
    );
    expect(rallyPortalPath('season-one')).toContain('/season/season-one');
    expect(txToastSuccess.joinedRally('Season Two')).toBe(
      "You're in Season Two. Rally badge on your profile."
    );
    expect(txToastSuccess.joinedRally('Genesis Rally', 'Genesis')).toBe(
      "You're in Genesis Rally. Genesis badge on your profile."
    );
    expect(
      formatRallyMarkCaption({
        collectYocto: '1500000000000000000000',
        rank: 4,
      })
    ).toBe('1,500');
    expect(formatRallyMarkCaption({ rank: 12 })).toBe('#12');
  });
});
