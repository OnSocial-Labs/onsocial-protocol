export type DmOutgoingStatus = 'pending' | 'failed';

export type DmOutgoingDraft = {
  localId: string;
  threadId: string;
  peerAccountId: string;
  text: string;
  replyToMessageId?: string;
  createdAt: string;
  status: DmOutgoingStatus;
  error?: string;
  mediaFile?: File | null;
  mediaPreviewUrl?: string | null;
  mediaMime?: string | null;
};

export function createDmOutgoingLocalId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `local:${crypto.randomUUID()}`;
  }
  return `local:${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function isLocalDmMessageId(id: string | null | undefined): boolean {
  return Boolean(id?.startsWith('local:'));
}

/** Skip decrypt for pending stubs (empty envelope) and local ids. */
export function shouldDecryptDmRecord(msg: {
  id: string;
  ciphertext?: string | null;
}): boolean {
  if (isLocalDmMessageId(msg.id)) return false;
  return Boolean(msg.ciphertext?.trim());
}

export function revokeBlobUrls(
  urls: Iterable<string | null | undefined>
): void {
  const seen = new Set<string>();
  for (const url of urls) {
    if (!url || !url.startsWith('blob:') || seen.has(url)) continue;
    seen.add(url);
    URL.revokeObjectURL(url);
  }
}
