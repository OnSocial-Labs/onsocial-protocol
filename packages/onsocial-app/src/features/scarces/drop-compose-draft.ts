/**
 * Cross-surface draft for “Post this Drop” — Drop page / clip / Market Yours
 * set a draft; the global DropComposeHost opens the personal composer.
 *
 * Collection mint announce: `collectionId` (± optional `tokenId` for a seat).
 * Resale announce: listed edition — `tokenId` required; `collectionId` when
 * Drop-backed, omitted for post-minted `s:` tokens.
 */

export interface DropComposeDraft {
  /** Drop collection when announcing a primary mint or Drop edition. */
  collectionId?: string;
  /** Specific edition — required for resale announces without a collection. */
  tokenId?: string;
  title: string;
  mediaUrl?: string | null;
  mediumKind?: string | null;
  /** Optional caption prefill. */
  text?: string;
  /** Original mint post path (`author/post/id`) for See original on resale. */
  sourcePostPath?: string | null;
}

type Listener = () => void;

let pending: DropComposeDraft | null = null;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

export function scarcesContractIdForNetwork(): string {
  return process.env.NEXT_PUBLIC_NEAR_NETWORK === 'mainnet'
    ? 'scarces.onsocial.near'
    : 'scarces.onsocial.testnet';
}

export function isDropComposeDraftReady(
  draft: Pick<DropComposeDraft, 'collectionId' | 'tokenId'> | null | undefined
): boolean {
  return Boolean(draft?.collectionId?.trim() || draft?.tokenId?.trim());
}

/** Queue a Drop / resale compose draft and notify the host. */
export function requestDropCompose(draft: DropComposeDraft): void {
  const collectionId = draft.collectionId?.trim() || '';
  const tokenId = draft.tokenId?.trim() || '';
  if (!collectionId && !tokenId) return;
  pending = {
    ...(collectionId ? { collectionId } : {}),
    ...(tokenId ? { tokenId } : {}),
    title: draft.title.trim() || collectionId || tokenId,
    ...(draft.mediaUrl?.trim() ? { mediaUrl: draft.mediaUrl.trim() } : {}),
    ...(draft.mediumKind?.trim()
      ? { mediumKind: draft.mediumKind.trim().toLowerCase() }
      : {}),
    ...(draft.text?.trim() ? { text: draft.text.trim() } : {}),
    ...(draft.sourcePostPath?.trim()
      ? { sourcePostPath: draft.sourcePostPath.trim() }
      : {}),
  };
  emit();
}

export function peekDropComposeDraft(): DropComposeDraft | null {
  return pending;
}

/** Take the pending draft (clears it). */
export function takeDropComposeDraft(): DropComposeDraft | null {
  const next = pending;
  pending = null;
  if (next) emit();
  return next;
}

export function clearDropComposeDraft(): void {
  if (!pending) return;
  pending = null;
  emit();
}

export function subscribeDropComposeDraft(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Map Drop medium to a feed PostKind when posting. */
export function postKindFromDropMedium(
  mediumKind: string | null | undefined
): 'audio' | 'video' | 'image' | 'text' {
  const key = (mediumKind ?? '').trim().toLowerCase();
  if (key === 'audio' || key === 'music') return 'audio';
  if (key === 'video') return 'video';
  if (key === 'art' || key === 'image') return 'image';
  return 'text';
}
