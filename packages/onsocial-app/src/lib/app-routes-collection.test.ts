import { describe, expect, it } from 'vitest';
import {
  canonicalizeDropLayerHref,
  collectionPath,
  isOverlayDropLayerLocation,
  parseInAppDropLayerHref,
} from '@/lib/app-routes';

describe('parseInAppDropLayerHref', () => {
  it('parses a public drop permalink', () => {
    expect(parseInAppDropLayerHref('/collection/drop-1')).toEqual({
      collectionId: 'drop-1',
    });
  });

  it('decodes encoded collection ids', () => {
    expect(parseInAppDropLayerHref('/collection/a%2Fb')).toEqual({
      collectionId: 'a/b',
    });
  });

  it('ignores door and redeem staff pages', () => {
    expect(parseInAppDropLayerHref('/collection/drop-1/door')).toBeNull();
    expect(parseInAppDropLayerHref('/collection/drop-1/redeem')).toBeNull();
  });
});

describe('canonicalizeDropLayerHref', () => {
  it('keeps read query on the share permalink', () => {
    expect(canonicalizeDropLayerHref('/collection/drop-1?read=1')).toBe(
      `${collectionPath('drop-1')}?read=1`
    );
  });
});

describe('isOverlayDropLayerLocation', () => {
  it('is true when the browser is on a drop permalink over Discover', () => {
    expect(
      isOverlayDropLayerLocation('/discover', '/collection/drop-1')
    ).toBe(true);
  });

  it('is false on a real drop page or a non-drop location', () => {
    expect(
      isOverlayDropLayerLocation('/collection/drop-1', '/collection/drop-1')
    ).toBe(false);
    expect(isOverlayDropLayerLocation('/discover', '/discover')).toBe(false);
  });
});
