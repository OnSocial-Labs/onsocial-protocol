import { describe, expect, it } from 'vitest';
import { buildPageMoodConfig, mergeMoodIntoPageConfig, resolvePortfolioMood } from './resolve';

describe('resolvePortfolioMood', () => {
  it('defaults to the clean portfolio mood when none is set', () => {
    const mood = resolvePortfolioMood({});
    expect(mood.id).toBe('default');
    expect(mood.label).toBe('Default');
    expect(mood.cssVars['--mood-bg']).toBe('#050505');
  });

  it('resolves a stored celebration mood with note', () => {
    const mood = resolvePortfolioMood({
      mood: { id: 'celebration', since: 1_700_000_000_000, note: 'just shipped' },
    });
    expect(mood.id).toBe('celebration');
    expect(mood.label).toBe('Celebration');
    expect(mood.note).toBe('just shipped');
  });

  it('merges mood into existing page config', () => {
    const next = mergeMoodIntoPageConfig(
      { tagline: 'Builder', sections: ['profile' as const] },
      'celebration'
    );
    expect(next.tagline).toBe('Builder');
    expect(next.sections).toEqual(['profile']);
    expect(next.mood?.id).toBe('celebration');
    expect(next.theme?.background).toBe('#0a0508');
  });

  it('builds on-chain page config for lead mood', () => {
    const payload = buildPageMoodConfig('lead', {
      note: 'board prep',
      now: 123,
    });
    expect(payload.mood).toEqual({
      id: 'lead',
      since: 123,
      note: 'board prep',
    });
    expect(payload.theme?.background).toBe('#070605');
  });
});
