import { describe, expect, it } from 'vitest';

import {
  isSeasonAutoPublishEnabled,
  resolveSeasonAutoFinalizeGraceEndsAtNs,
} from '../../src/services/seasons/season-settlement-automation.js';

describe('season-settlement-automation', () => {
  it('adds grace period after on-chain season end', () => {
    const endsAtNs = '1000000000000000000';
    expect(resolveSeasonAutoFinalizeGraceEndsAtNs(endsAtNs, 60_000)).toBe(
      BigInt(endsAtNs) + 60_000n * 1_000_000n
    );
  });

  it('keeps auto-publish off unless explicitly enabled', () => {
    const previous = process.env.SEASON_AUTO_PUBLISH_ENABLED;
    delete process.env.SEASON_AUTO_PUBLISH_ENABLED;
    expect(isSeasonAutoPublishEnabled()).toBe(false);
    process.env.SEASON_AUTO_PUBLISH_ENABLED = 'true';
    expect(isSeasonAutoPublishEnabled()).toBe(true);
    if (previous === undefined) {
      delete process.env.SEASON_AUTO_PUBLISH_ENABLED;
    } else {
      process.env.SEASON_AUTO_PUBLISH_ENABLED = previous;
    }
  });
});
