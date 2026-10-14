import {
  isCollectionMintable,
  type CollectionStatus,
} from '@/features/scarces/collections-data';

/** Live public mint, or allowlist early mint. */
export function dropsShopMintable(opts: {
  status: CollectionStatus | null;
  hasAllowlist: boolean;
  allowlistRemaining?: number | null;
}): boolean {
  if (opts.status != null && isCollectionMintable(opts.status)) return true;
  return (
    opts.status === 'upcoming' &&
    opts.hasAllowlist &&
    opts.allowlistRemaining != null &&
    opts.allowlistRemaining > 0
  );
}

/** House list door — Collect when you can take an edition, else Open. */
export function dropsShopActionLabel(mintable: boolean): 'Collect' | 'Open' {
  return mintable ? 'Collect' : 'Open';
}

/** Cover tap on the Drops list — the medium stays on the surface. */
export type DropsListCoverAction = 'listen' | 'read' | 'artwork';

const DROPS_WRITING_KINDS = new Set([
  'writing',
  'issue',
  'article',
  'book',
  'text',
]);

/**
 * Drops list cover.
 * Writing, a book, or an article reads. Audio with tracks listens.
 * Any other cover with art opens large. Title, Drop, Collect, and Open
 * stay links to the drop page.
 */
export function dropsListCoverAction(item: {
  mediumKind: string | null;
  hasPlayable: boolean;
  mediaUrl: string | null;
  view?: {
    kind?: string | null;
    readables?: readonly unknown[] | null;
    bookPdf?: unknown | null;
  } | null;
}): DropsListCoverAction | null {
  const kind = (item.mediumKind ?? item.view?.kind ?? '').trim().toLowerCase();
  const hasReadables =
    (item.view?.readables?.length ?? 0) > 0 || item.view?.bookPdf != null;
  if (hasReadables || DROPS_WRITING_KINDS.has(kind)) return 'read';
  const isAudio = kind === 'audio' || kind === 'music';
  if (isAudio && item.hasPlayable) return 'listen';
  if (!isAudio && Boolean(item.mediaUrl?.trim())) return 'artwork';
  return null;
}

export function dropsListCoverLabel(
  action: DropsListCoverAction,
  title: string
): string {
  if (action === 'listen') return `Listen to ${title}`;
  if (action === 'read') return `Read ${title}`;
  return `View ${title}`;
}
