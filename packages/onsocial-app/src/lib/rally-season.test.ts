import { describe, expect, it } from 'vitest';
import { txToastSuccess } from '@/lib/transaction-toast-copy';
import {
  formatRallyMarkCaption,
  formatRallyPrizeLine,
  parseJoinRallyMinYocto,
  resolveRallyLifecyclePhase,
  resolveRallyMeritWhy,
  rallyMeritScore,
  resolveRallyCanJoin,
  resolveRallyMarkNudge,
  resolveRallyOccasion,
  resolveRallyPresentation,
  resolveRallySheetView,
  resolveRallyStandingStrip,
  shouldFetchRallyJoinAffordance,
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
    expect(txToastSuccess.joinedRally('Season Two')).toBe(
      "You're in Season Two."
    );
    expect(txToastSuccess.joinedRally('Genesis Rally')).toBe(
      "You're in Genesis Rally."
    );
    expect(
      formatRallyMarkCaption({
        collectYocto: '1500000000000000000000',
        rank: 4,
      })
    ).toBe('1,500');
    expect(formatRallyMarkCaption({ rank: 12 })).toBe('#12');
  });

  it('writes a prize line from pool and field size', () => {
    expect(
      formatRallyPrizeLine({
        poolYocto: '1500000000000000000000',
        participantCount: 48,
      })
    ).toBe('1,500 SOCIAL · 48 in');
    expect(formatRallyPrizeLine({ poolYocto: '0', participantCount: 0 })).toBe(
      ''
    );
    expect(
      formatRallyPrizeLine({ poolYocto: '1500000000000000000000' })
    ).toBe('1,500 SOCIAL');
    expect(formatRallyPrizeLine({ participantCount: 3 })).toBe('3 in');
  });

  it('windows the standing strip around the viewer', () => {
    const rows = [
      { rank: 1, score: 90, accountId: 'a.near' },
      { rank: 2, score: 80, accountId: 'b.near' },
      { rank: 3, score: 70, accountId: 'c.near' },
      { rank: 4, score: 60, accountId: 'd.near' },
    ];
    expect(
      resolveRallyStandingStrip({ rows, viewerAccountId: null }).map(
        (row) => row.accountId
      )
    ).toEqual(['a.near', 'b.near', 'c.near']);
    expect(
      resolveRallyStandingStrip({
        rows,
        viewerAccountId: 'c.near',
        viewerStanding: { rank: 3, score: 70, accountId: 'c.near' },
      }).map((row) => row.accountId)
    ).toEqual(['b.near', 'c.near', 'd.near']);
    expect(
      resolveRallyStandingStrip({
        rows,
        viewerAccountId: 'you.near',
        viewerStanding: { rank: 12, score: 11, accountId: 'you.near' },
      }).map((row) => row.accountId)
    ).toEqual(['c.near', 'd.near', 'you.near']);
  });

  it('shows merit on the strip and a why line for the viewer', () => {
    const breakdown = {
      join: 1000,
      profile: 250,
      endorsements: 500,
      solidarity: 225,
      support: 0,
      boost: 0,
    };
    expect(rallyMeritScore(breakdown)).toBe(975);
    expect(
      resolveRallyStandingStrip({
        rows: [
          {
            rank: 1,
            score: 1975,
            accountId: 'a.near',
            breakdown,
          },
        ],
      })[0]?.score
    ).toBe(975);
    expect(resolveRallyMeritWhy(breakdown)).toBe(
      'Endorsements are carrying you.'
    );
    expect(
      resolveRallyMeritWhy({
        join: 1000,
        profile: 0,
        endorsements: 400,
        solidarity: 350,
        support: 0,
        boost: 0,
      })
    ).toBe('Endorsements and stands are carrying you.');
    expect(resolveRallyMeritWhy(null)).toBe(
      'Stand, endorse, and boost to move.'
    );
    expect(resolveRallyMeritWhy(null, true)).toBe(
      "Activity didn't move this."
    );
    expect(
      resolveRallyMeritWhy(
        {
          join: 1000,
          profile: 0,
          endorsements: 0,
          solidarity: 400,
          support: 0,
          boost: 0,
        },
        true
      )
    ).toBe('Stands carried you.');
  });

  it('keeps the sheet number-first', () => {
    expect(
      resolveRallySheetView({
        loaded: true,
        pageTitle: 'OnSocial Rally #4',
        phase: 'claim_open',
        joined: false,
        canCollect: true,
        collectYocto: '1500000000000000000000',
        collected: false,
        isConnected: true,
      })
    ).toEqual({
      eyebrow: 'Rally',
      title: '1,500',
      titleUnit: 'SOCIAL',
      body: 'Ready to collect.',
      ariaLabel: '1,500 SOCIAL ready to collect',
    });
    expect(
      resolveRallySheetView({
        loaded: true,
        pageTitle: 'OnSocial Rally #4',
        phase: 'live',
        joined: true,
        rank: 12,
        canCollect: false,
        collected: false,
        isConnected: true,
      })
    ).toMatchObject({
      eyebrow: 'Rally',
      title: '#12',
      body: '',
    });
    expect(
      resolveRallySheetView({
        loaded: true,
        pageTitle: 'OnSocial Rally #4',
        phase: 'live',
        joined: true,
        canCollect: false,
        collected: false,
        isConnected: true,
      })
    ).toMatchObject({
      eyebrow: 'Rally',
      title: 'OnSocial Rally #4',
      body: '',
    });
    expect(
      resolveRallySheetView({
        loaded: true,
        pageTitle: 'OnSocial Rally #4',
        phase: 'live',
        joined: false,
        canCollect: false,
        collected: false,
        joinMinLabel: '10',
        isConnected: true,
      })
    ).toMatchObject({
      eyebrow: 'Rally',
      title: 'Join',
      titleUnit: '10 SOCIAL',
      body: '',
    });
    expect(
      resolveRallySheetView({
        loaded: true,
        pageTitle: 'OnSocial Rally #4',
        phase: 'claim_open',
        joined: false,
        canCollect: false,
        collected: false,
        isConnected: false,
      }).body
    ).toBe('Connect to collect if you placed.');
  });

  it('prefetches join affordance for live connected marks, not guests or claim', () => {
    expect(
      shouldFetchRallyJoinAffordance({
        seasonId: 'season-one',
        live: true,
        sheetOpen: false,
        accountId: 'alice.near',
      })
    ).toBe(true);
    expect(
      shouldFetchRallyJoinAffordance({
        seasonId: 'season-one',
        live: true,
        sheetOpen: false,
        accountId: null,
      })
    ).toBe(false);
    expect(
      shouldFetchRallyJoinAffordance({
        seasonId: 'season-one',
        live: true,
        sheetOpen: true,
        accountId: null,
      })
    ).toBe(true);
    expect(
      shouldFetchRallyJoinAffordance({
        seasonId: 'season-four',
        live: false,
        sheetOpen: false,
        accountId: 'alice.near',
      })
    ).toBe(false);
  });

  it('nudges only when the viewer can join or collect', () => {
    expect(
      resolveRallyCanJoin({
        seasonId: 'season-one',
        accountId: 'alice.near',
        phase: 'live',
        joined: false,
        joinMinYocto: 1n,
        hasEnoughSocial: true,
      })
    ).toBe(true);
    expect(
      resolveRallyCanJoin({
        seasonId: 'season-one',
        accountId: null,
        phase: 'live',
        joined: false,
        joinMinYocto: 1n,
        hasEnoughSocial: true,
      })
    ).toBe(false);
    expect(
      resolveRallyCanJoin({
        seasonId: 'season-one',
        accountId: 'alice.near',
        phase: 'live',
        joined: false,
        joinMinYocto: 1n,
        hasEnoughSocial: false,
      })
    ).toBe(false);
    expect(
      resolveRallyMarkNudge({
        visible: true,
        canJoin: true,
        canCollect: false,
      })
    ).toBe(true);
    expect(
      resolveRallyMarkNudge({
        visible: true,
        canJoin: false,
        canCollect: true,
      })
    ).toBe(true);
    expect(
      resolveRallyMarkNudge({
        visible: true,
        canJoin: false,
        canCollect: false,
      })
    ).toBe(false);
  });
});
