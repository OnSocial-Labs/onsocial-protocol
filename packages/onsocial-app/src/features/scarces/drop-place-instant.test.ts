import { afterEach, describe, expect, it, vi } from 'vitest';
import { rememberCollectionCreatorFace } from '@/features/scarces/collection-creator-face-cache';
import { clearCollectionCreatorFaceCache } from '@/features/scarces/collection-creator-face-cache';
import { seedCollectionViewFromPeek } from '@/features/scarces/collection-page-view';
import { clearCollectionViewCache } from '@/features/scarces/collection-view-cache';
import { rememberCollectionView } from '@/features/scarces/collection-view-cache';
import {
  armDropPlaceInstant,
  clearDropPlaceInstant,
  collectionRscDefersToInstantHost,
  DROP_PLACE_INSTANT_COOKIE,
  getDropPlaceInstant,
  instantDropFirstPaint,
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
    vi.stubGlobal('document', { cookie: '' });

    const armed = armDropPlaceInstant({
      href: '/collection/night-drive',
      collectionId: 'night-drive',
    });
    const paint = instantDropFirstPaint('night-drive');

    expect(armed?.pathname).toBe('/collection/night-drive');
    expect(armed?.fromPathname).toBe('/home');
    expect(armed?.committed).toBe(false);
    expect(getDropPlaceInstant()).toBe(armed);
    expect(paint.view?.title).toBe('Night Drive');
    expect(paint.view?.mediaUrl).toBe('ipfs://cover');
    expect(paint.creator?.displayName).toBe('Ada');
    expect(pushed).toEqual(['/collection/night-drive']);
    expect(document.cookie).toContain(DROP_PLACE_INSTANT_COOKIE);
  });

  it('has no seed view when the tap did not warm one', () => {
    const paint = instantDropFirstPaint('no-such-drop');
    expect(paint.view).toBeNull();
    expect(paint.creator).toBeNull();
  });

  it('defers only the armed client RSC, not a hard refresh', () => {
    expect(
      collectionRscDefersToInstantHost({
        rscHeader: '1',
        cookie: encodeURIComponent('night-drive'),
        collectionId: 'night-drive',
      })
    ).toBe(true);
    expect(
      collectionRscDefersToInstantHost({
        rscHeader: null,
        cookie: 'night-drive',
        collectionId: 'night-drive',
      })
    ).toBe(false);
    expect(
      collectionRscDefersToInstantHost({
        rscHeader: '1',
        cookie: 'other-drop',
        collectionId: 'night-drive',
      })
    ).toBe(false);
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
    vi.stubGlobal('document', { cookie: '' });

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
