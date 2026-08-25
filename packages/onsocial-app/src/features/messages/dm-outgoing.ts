export type DmOutgoingStatus = 'pending' | 'failed' | 'confirmed';

export type DmOutgoingDraft = {
  localId: string;
  threadId: string;
  peerAccountId: string;
  text: string;
  replyToMessageId?: string;
  createdAt: string;
  status: DmOutgoingStatus;
  /** Set after the send tx confirms; used to drop the overlay when mailbox returns. */
  messageId?: string;
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

export function archiveHasDecryptableMessage(
  archive: readonly { id: string; ciphertext?: string | null }[],
  messageId: string | undefined
): boolean {
  if (!messageId) return false;
  return archive.some(
    (msg) => msg.id === messageId && shouldDecryptDmRecord(msg)
  );
}

/** Keep overlay until mailbox returns a decryptable row for that id. */
export function shouldRetainOutgoing(
  item: Pick<DmOutgoingDraft, 'status' | 'messageId'>,
  archive: readonly { id: string; ciphertext?: string | null }[]
): boolean {
  if (item.status !== 'confirmed') return true;
  return !archiveHasDecryptableMessage(archive, item.messageId);
}

export function retainOutgoingAgainstArchive<T extends DmOutgoingDraft>(
  outgoing: readonly T[],
  archive: readonly { id: string; ciphertext?: string | null }[]
): T[] {
  return outgoing.filter((item) => shouldRetainOutgoing(item, archive));
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
