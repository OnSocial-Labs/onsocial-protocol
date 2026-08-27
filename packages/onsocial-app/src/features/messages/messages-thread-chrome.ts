/** One-line OsAppScreen title for an open DM thread (mobile + desktop). */
export function messagesThreadChromeTitle(
  peerName: string,
  peerHandle: string
): string {
  const name = peerName.trim();
  const handle = peerHandle.trim();
  if (name && handle && name !== handle) {
    return `${name} · @${handle}`;
  }
  return name || handle || 'Conversation';
}
