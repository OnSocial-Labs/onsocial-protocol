import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rememberCollectionCreatorFace } from '@/features/scarces/collection-creator-face-cache';
import { clearCollectionCreatorFaceCache } from '@/features/scarces/collection-creator-face-cache';
import { seedCollectionViewFromPeek } from '@/features/scarces/collection-page-view';
import { clearCollectionViewCache } from '@/features/scarces/collection-view-cache';
import { rememberCollectionView } from '@/features/scarces/collection-view-cache';
import {
  armDropPlaceInstant,
  clearDropPlaceInstant,
  getDropPlaceInstant,
  instantDropFirstPaint,
  instantHostOwns,
} from '@/features/scarces/drop-place-instant';
import { navigateDropPlace } from '@/features/scarces/drop-place-open';

describe('drop place instant first paint', () => {
  afterEach(() => {
    clearDropPlaceInstant();
    clearCollectionViewCache();
    clearCollectionCreatorFaceCache();
    vi.unstubAllGlobals();
  });

  it('paints the card seed (cover, title, creator) on the arm, before navigation', () => {
    const view = seedCollectionViewFromPeek({
      collectionId: 'night-drive',
      title: 'Night Drive',
      coverUrl: 'ipfs://cover',
      creatorId: 'ada.near',
    });
    expect(view).not.toBeNull();
    rememberCollectionView(view);
    rememberCollectionCreatorFace('night-drive', {
      displayName: 'Ada',
      avatarUrl: 'ipfs://ada',
    });

    const pushed: string[] = [];
    vi.stubGlobal('window', {
      location: {
        href: 'http://localhost/home',
        pathname: '/home',
        search: '',
      },
      history: {
        pushState: (_data: unknown, _unused: string, url?: string) => {
          pushed.push(String(url));
        },
      },
    });
    const armed = armDropPlaceInstant({
      href: '/collection/night-drive',
      collectionId: 'night-drive',
    });
    const paint = instantDropFirstPaint('night-drive');

    expect(armed?.pathname).toBe('/collection/night-drive');
    expect(armed?.committed).toBe(false);
    expect(getDropPlaceInstant()).toBe(armed);
    expect(instantHostOwns('night-drive')).toBe(true);
    expect(instantHostOwns('other')).toBe(false);
    expect(paint.view?.title).toBe('Night Drive');
    expect(paint.view?.mediaUrl).toBe('ipfs://cover');
    expect(paint.creator?.displayName).toBe('Ada');
    expect(pushed).toEqual(['/collection/night-drive']);
  });

  it('has no seed view when the tap did not warm one', () => {
    const paint = instantDropFirstPaint('no-such-drop');
    expect(paint.view).toBeNull();
    expect(paint.creator).toBeNull();
  });

  it('the route slot paints only when the host is not already showing that drop', () => {
    const slot = readFileSync(
      new URL('./drop-place-instant-host.tsx', import.meta.url),
      'utf8'
    );
    const page = readFileSync(
      new URL(
        '../../app/(app)/collection/[collectionId]/page.tsx',
        import.meta.url
      ),
      'utf8'
    );
    expect(slot).toContain('instantHostOwns');
    expect(slot).toContain('if (armed) return null');
    expect(slot).toContain('<CollectionPagePanel');
    expect(page).toContain('CollectionRouteSlot');
    expect(page).toContain('yieldToHost');
    expect(page).toContain("headerList.get('next-url')");
    expect(page).not.toContain("get('rsc')");
    expect(page).not.toContain('return null');
    expect(page.indexOf('loadCollectionPageData')).toBeLessThan(
      page.indexOf('<CollectionRouteSlot')
    );
  });

  it('navigateDropPlace arms the seed before router.push', () => {
    const view = seedCollectionViewFromPeek({
      collectionId: 'night-drive',
      title: 'Night Drive',
      coverUrl: 'ipfs://cover',
      creatorId: 'ada.near',
    });
    const order: string[] = [];
    vi.stubGlobal('window', {
      location: {
        href: 'http://localhost/home',
        pathname: '/home',
        search: '',
      },
      history: {
        pushState: () => {
          order.push('url');
        },
      },
    });
    const pushed: string[] = [];
    const ok = navigateDropPlace(
      {
        prefetch: () => {
          order.push('prefetch');
        },
        push: (href) => {
          order.push('push');
          pushed.push(href);
        },
      },
      {
        href: '/collection/night-drive',
        initial: view,
        initialCreator: { displayName: 'Ada', avatarUrl: null },
        fanCount: 4,
        fanIds: ['ada.near'],
      }
    );

    expect(ok).toBe(true);
    expect(pushed).toEqual(['/collection/night-drive']);
    expect(order.indexOf('url')).toBeLessThan(order.indexOf('push'));
    expect(order.indexOf('prefetch')).toBeLessThan(order.indexOf('push'));
    const paint = instantDropFirstPaint('night-drive');
    expect(paint.view?.title).toBe('Night Drive');
    expect(paint.view?.mediaUrl).toBe('ipfs://cover');
    expect(paint.creator?.displayName).toBe('Ada');
    expect(getDropPlaceInstant()?.collectionId).toBe('night-drive');
  });
});
