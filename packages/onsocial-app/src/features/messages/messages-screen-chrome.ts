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
 * One pane, every viewport — same drill-in as Activity.
 * List: inbox title + default back. Thread: peer title + close-thread back.
 */
export function resolveMessagesScreenChrome({
  threadOpen,
  peerName,
  peerHandle,
  peerAccountId,
}: {
  threadOpen: boolean;
  peerName: string;
  peerHandle: string;
  peerAccountId: string;
}): MessagesScreenChrome {
  if (threadOpen) {
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
