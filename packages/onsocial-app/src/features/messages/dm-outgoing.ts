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
