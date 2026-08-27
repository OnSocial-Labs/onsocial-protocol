import { describe, expect, it } from 'vitest';
import { MARKET_MEDIUM_FILTERS } from '@/features/market/market-medium';
import { DROP_TEMPLATES, supplyUnitForMediumKind } from './drop-templates';

describe('DROP_TEMPLATES', () => {
  it('has unique ids and complete copy', () => {
    const ids = DROP_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const template of DROP_TEMPLATES) {
      expect(template.label.trim()).not.toBe('');
      expect(template.helpTitle.trim()).not.toBe('');
      expect(template.tagline.trim()).not.toBe('');
      expect(template.hint.trim()).not.toBe('');
      expect(template.unit.trim()).not.toBe('');
      expect(template.unitSingular.trim()).not.toBe('');
    }
  });

  it('keeps kind help readable (one-liner + enriched detail)', () => {
    for (const template of DROP_TEMPLATES) {
      expect(template.tagline.length).toBeLessThanOrEqual(80);
      expect(template.hint.length).toBeLessThanOrEqual(320);
      expect(template.tagline.includes('\n')).toBe(false);
      expect(template.hint.includes('\n')).toBe(false);
      expect(template.helpTitle.toLowerCase()).toMatch(/ drop$/);
      expect(template.helpTitle.toLowerCase()).not.toContain('drops');
    }
  });

  it('every template kind is filterable in the market medium menu', () => {
    const filterIds = new Set(MARKET_MEDIUM_FILTERS.map((f) => f.id));
    for (const template of DROP_TEMPLATES) {
      if (template.kind != null) {
        expect(filterIds.has(template.kind as never)).toBe(true);
      }
    }
  });

  it('templates that require an access end preset renewable on', () => {
    // The access-end field only submits when renewable is enabled, so a
    // template demanding an expiry must switch renewals on for the creator.
    for (const template of DROP_TEMPLATES) {
      if (template.requiresAccessEnd) {
        expect(template.presets?.renewable).toBe(true);
      }
    }
  });

  it('tickets preset allow date changes and stamp access from event end', () => {
    const ticket = DROP_TEMPLATES.find((t) => t.id === 'ticket');
    expect(ticket?.presets?.renewable).toBe(true);
    expect(ticket?.requiresEventEnd).toBe(true);
    expect(ticket?.requiresAccessEnd).toBeUndefined();
  });

  it('templates with required Advanced fields open Advanced', () => {
    for (const template of DROP_TEMPLATES) {
      if (template.requiresAccessEnd || template.requiresEventEnd) {
        expect(template.openAdvanced).toBe(true);
      }
    }
  });

  it('tickets require an event end, not sale close', () => {
    const ticket = DROP_TEMPLATES.find((t) => t.id === 'ticket');
    expect(ticket?.requiresEventEnd).toBe(true);
    expect(ticket?.requiresAccessEnd).toBeUndefined();
    expect(ticket?.hint.toLowerCase()).not.toContain('sale close to the event');
  });

  it('presets max redeems as empty or a positive whole number', () => {
    for (const template of DROP_TEMPLATES) {
      const raw = template.presets?.maxRedeems ?? '';
      if (raw !== '') {
        const parsed = Number.parseInt(raw, 10);
        expect(Number.isSafeInteger(parsed) && parsed >= 1).toBe(true);
      }
    }
  });

  it('custom leaves rights presets untouched and stamps kind custom', () => {
    const custom = DROP_TEMPLATES.find((t) => t.id === 'custom');
    expect(custom?.presets).toBeNull();
    expect(custom?.kind).toBe('custom');
  });
});

describe('supplyUnitForMediumKind', () => {
  it('uses tickets for conference passes, copies for writing', () => {
    expect(supplyUnitForMediumKind('ticket').unit).toBe('tickets');
    expect(supplyUnitForMediumKind('writing').unit).toBe('copies');
    expect(supplyUnitForMediumKind('art').unit).toBe('editions');
  });
});
