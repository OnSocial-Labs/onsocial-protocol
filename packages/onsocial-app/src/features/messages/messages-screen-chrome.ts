export const MESSAGES_NARROW_MAX_PX = 767;
export const MESSAGES_INBOX_TITLE = 'Messages';
export const MESSAGES_INBOX_SUBTITLE = 'Private · sealed on your device';

export type MessagesScreenChrome = {
  title: string;
  subtitle?: string;
  titleHref?: string;
  /** When true, leading back closes the thread instead of leaving Messages. */
  closeThread: boolean;
};

/**
 * Inbox chrome on desktop (and mobile list). Mobile thread uses the peer
 * as the real screen title so the `h1` / back match what is on screen.
 */
export function resolveMessagesScreenChrome({
  narrow,
  threadOpen,
  peerName,
  peerHandle,
  peerAccountId,
}: {
  narrow: boolean;
  threadOpen: boolean;
  peerName: string;
  peerHandle: string;
  peerAccountId: string;
}): MessagesScreenChrome {
  if (narrow && threadOpen) {
    return {
      title: peerName || 'Conversation',
      subtitle:
        peerHandle && peerName !== peerHandle ? `@${peerHandle}` : undefined,
      titleHref: peerAccountId ? `/${peerAccountId}` : undefined,
      closeThread: true,
    };
  }
  return {
    title: MESSAGES_INBOX_TITLE,
    subtitle: MESSAGES_INBOX_SUBTITLE,
    closeThread: false,
  };
}
