/**
 * Cross-surface draft for “Post this Drop” — Drop page / clip / Market Yours
 * set a draft; the global DropComposeHost opens the personal composer.
 */

export interface DropComposeDraft {
  collectionId: string;
  tokenId?: string;
  title: string;
  mediaUrl?: string | null;
  mediumKind?: string | null;
  /** Optional caption prefill. */
  text?: string;
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

/** Queue a Drop compose draft and notify the host. */
export function requestDropCompose(draft: DropComposeDraft): void {
  const collectionId = draft.collectionId.trim();
  if (!collectionId) return;
  pending = {
    collectionId,
    ...(draft.tokenId?.trim() ? { tokenId: draft.tokenId.trim() } : {}),
    title: draft.title.trim() || collectionId,
    ...(draft.mediaUrl?.trim() ? { mediaUrl: draft.mediaUrl.trim() } : {}),
    ...(draft.mediumKind?.trim()
      ? { mediumKind: draft.mediumKind.trim().toLowerCase() }
      : {}),
    ...(draft.text?.trim() ? { text: draft.text.trim() } : {}),
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
