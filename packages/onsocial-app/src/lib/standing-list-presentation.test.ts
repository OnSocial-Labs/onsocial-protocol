import { describe, expect, it } from 'vitest';
import {
  standingListLoadPlan,
  standingListShowsSkeleton,
} from './standing-list-presentation';

const ready = {
  listPreview: false,
  searching: false,
  relationshipSynced: true,
  walletLoading: false,
  viewerKnown: true,
  hasRows: true,
  listBootstrapReady: true,
  isLoading: false,
};

describe('standing list skeleton', () => {
  it('keeps the preview skeleton', () => {
    expect(standingListShowsSkeleton({ ...ready, listPreview: true })).toBe(
      true
    );
  });

  it('holds names until the signed-in relationship lines are in', () => {
    expect(
      standingListShowsSkeleton({
        ...ready,
        relationshipSynced: false,
        hasRows: true,
      })
    ).toBe(true);
  });

  it('shows the finished rows once the relationship lines are in', () => {
    expect(standingListShowsSkeleton(ready)).toBe(false);
  });

  it('holds the list while the wallet is still resolving', () => {
    expect(
      standingListShowsSkeleton({
        ...ready,
        relationshipSynced: false,
        walletLoading: true,
        viewerKnown: false,
      })
    ).toBe(true);
  });

  it('shows a signed-out list that has no viewer lines to wait for', () => {
    expect(
      standingListShowsSkeleton({
        ...ready,
        relationshipSynced: false,
        viewerKnown: false,
        walletLoading: false,
      })
    ).toBe(false);
  });

  it('keeps the skeleton for an empty list that is still loading', () => {
    expect(
      standingListShowsSkeleton({
        ...ready,
        relationshipSynced: true,
        viewerKnown: false,
        hasRows: false,
        listBootstrapReady: false,
        isLoading: true,
      })
    ).toBe(true);
  });

  it('does not hold a search on the full-list skeleton', () => {
    expect(
      standingListShowsSkeleton({
        ...ready,
        searching: true,
        relationshipSynced: false,
      })
    ).toBe(false);
  });
});

describe('standing list load plan', () => {
  it('joins viewer lines onto the first page instead of rebuilding it', () => {
    expect(
      standingListLoadPlan({
        cacheReady: false,
        canUseInitialList: true,
        viewerKnown: true,
      })
    ).toBe('viewer-lines');
  });

  it('keeps the signed-out first page without a second read', () => {
    expect(
      standingListLoadPlan({
        cacheReady: false,
        canUseInitialList: true,
        viewerKnown: false,
      })
    ).toBe('signed-out-ready');
  });

  it('reads a full page when the people on screen are not the seed', () => {
    expect(
      standingListLoadPlan({
        cacheReady: false,
        canUseInitialList: false,
        viewerKnown: true,
      })
    ).toBe('full-page');
  });

  it('refreshes a cache that already has this viewer', () => {
    expect(
      standingListLoadPlan({
        cacheReady: true,
        canUseInitialList: true,
        viewerKnown: true,
      })
    ).toBe('cache-refresh');
  });
});
