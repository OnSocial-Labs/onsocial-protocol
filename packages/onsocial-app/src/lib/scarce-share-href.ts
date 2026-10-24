import {
  APP_COLLECTIBLES_PLAY_PATH,
  COLLECTIBLES_PLAY_PARAM,
  COLLECTIBLES_PLAY_TOKEN_PARAM,
  collectiblesPlayPath,
  collectionPath,
} from '@/lib/app-routes';

function absolutePath(pageHref: string, path: string): string {
  try {
    const url = new URL(pageHref);
    return `${url.origin}${path}`;
  } catch {
    return path;
  }
}

/**
 * Share target for the collectible player control.
 * An open edition (`/collectibles/play?c=&t=`) copies that player URL.
 * The player with no edition copies the drop page.
 * Every other page keeps its current href.
 */
export function scarceClipShareHref(
  collectionId: string,
  pageHref: string
): string {
  const id = collectionId.trim();
  let url: URL;
  try {
    url = new URL(pageHref, 'https://onsocial.local');
  } catch {
    return pageHref;
  }

  const path = url.pathname.replace(/\/$/, '') || '/';
  if (path !== APP_COLLECTIBLES_PLAY_PATH) return pageHref;

  const fromQuery = url.searchParams.get(COLLECTIBLES_PLAY_PARAM)?.trim() || '';
  const tokenId =
    url.searchParams.get(COLLECTIBLES_PLAY_TOKEN_PARAM)?.trim() || '';
  const collection = fromQuery || id;
  if (tokenId && collection) {
    return absolutePath(
      pageHref,
      collectiblesPlayPath(collection, { tokenId })
    );
  }
  if (id) return absolutePath(pageHref, collectionPath(id));
  return pageHref;
}
