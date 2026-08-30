import { describe, expect, it } from 'vitest';
import { tokenAmountToSmallestUnit } from '@/lib/app-near-rpc';
import {
  buildProtocolSeasonConfigInput,
  durationDaysToMs,
  protocolCreateSeasonConfigReady,
  suggestNextRallySeasonId,
} from '@/features/protocol/protocol-season-config';

describe('protocol season config', () => {
  it('builds set_season_config input relative to submit time', () => {
    const input = buildProtocolSeasonConfigInput(
      {
        seasonId: 'Season-Two',
        label: 'OnSocial Rally',
        active: true,
        durationDays: '2',
      },
      { nowMs: 0 }
    );

    expect(input).toEqual({
      season_id: 'season-two',
      config: {
        label: 'OnSocial Rally',
        active: true,
        starts_at_ns: 600_000_000_000,
        ends_at_ns: 173_400_000_000_000,
        claim_starts_at_ns: null,
      },
    });
  });

  it('converts duration days to milliseconds', () => {
    expect(durationDaysToMs('1.5')).toBe(129_600_000);
  });

  it('suggests the next unused season id', () => {
    expect(suggestNextRallySeasonId([])).toBe('season-one');
    expect(suggestNextRallySeasonId(['season-two'])).toBe('season-three');
    expect(suggestNextRallySeasonId(['season-2', 'season-two'])).toBe(
      'season-3'
    );
  });

  it('requires a valid start-rally draft', () => {
    expect(
      protocolCreateSeasonConfigReady({
        seasonId: '',
        label: 'OnSocial Rally',
        active: true,
        durationDays: '7',
      })
    ).toBe(false);
    expect(
      protocolCreateSeasonConfigReady({
        seasonId: 'season-three',
        label: 'OnSocial Rally',
        active: true,
        durationDays: '7',
      })
    ).toBe(true);
  });
});

describe('protocol transfer amount conversion', () => {
  it('converts human token amounts with the selected asset decimals', () => {
    expect(tokenAmountToSmallestUnit('1.25', 6)).toBe('1250000');
    expect(tokenAmountToSmallestUnit('0.000000000000000001', 18)).toBe('1');
    expect(tokenAmountToSmallestUnit('1.5', 24)).toBe(
      '1500000000000000000000000'
    );
  });
});
