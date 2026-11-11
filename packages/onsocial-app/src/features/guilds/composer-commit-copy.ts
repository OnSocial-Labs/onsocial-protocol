/** Header verb on the composer. The chips name the mode; the button names the act. */
export function composerCommitCopy(opts: {
  postingAsDao: boolean;
  publishingArticle: boolean;
}): { label: string; pendingLabel: string } {
  if (opts.postingAsDao) {
    return { label: 'Propose', pendingLabel: 'Proposing…' };
  }
  if (opts.publishingArticle) {
    return { label: 'Publish', pendingLabel: 'Publishing…' };
  }
  return { label: 'Send', pendingLabel: 'Sending…' };
}
