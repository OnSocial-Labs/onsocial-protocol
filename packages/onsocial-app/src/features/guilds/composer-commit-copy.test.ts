import { describe, expect, it } from 'vitest';
import { composerCommitCopy } from './composer-commit-copy';

describe('composerCommitCopy', () => {
  it('posts a public post, reply, or quote', () => {
    expect(
      composerCommitCopy({ postingAsDao: false, publishingArticle: false })
    ).toEqual({ label: 'Post', pendingLabel: 'Posting…' });
  });

  it('publishes an article', () => {
    expect(
      composerCommitCopy({ postingAsDao: false, publishingArticle: true })
    ).toEqual({ label: 'Publish', pendingLabel: 'Publishing…' });
  });

  it('proposes when posting as a DAO', () => {
    expect(
      composerCommitCopy({ postingAsDao: true, publishingArticle: true })
    ).toEqual({ label: 'Propose', pendingLabel: 'Proposing…' });
  });
});
