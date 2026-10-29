import { describe, expect, it } from 'vitest';
import { resolveOsOverlayPortal, zoomFlightZ } from './os-card-host';

const card = { name: 'card' };
const probed = { name: 'probed' };
const body = { name: 'body' };

describe('resolveOsOverlayPortal', () => {
  it('keeps a registered card ahead of a DOM probe', () => {
    expect(
      resolveOsOverlayPortal({
        registered: card,
        probed,
        body,
      })
    ).toBe(card);
  });

  it('uses the card already in the DOM when the host is not registered yet', () => {
    expect(
      resolveOsOverlayPortal({
        registered: null,
        probed,
        body,
      })
    ).toBe(probed);
  });

  it('falls back to the window when no card exists', () => {
    expect(
      resolveOsOverlayPortal({
        registered: null,
        probed: null,
        body,
      })
    ).toBe(body);
  });

  it('keeps a viewport layer on the window', () => {
    expect(
      resolveOsOverlayPortal({
        viewport: true,
        registered: card,
        probed,
        body,
      })
    ).toBe(body);
  });
});

describe('zoomFlightZ', () => {
  it('sits one step above the face the stack actually painted', () => {
    expect(zoomFlightZ(80)).toBe(81);
    expect(zoomFlightZ(171)).toBe(172);
    expect(zoomFlightZ(Number.NaN)).toBe(0);
  });
});
