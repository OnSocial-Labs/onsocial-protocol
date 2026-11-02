export type ComposerToolbarTool =
  | 'media'
  | 'article'
  | 'poll'
  | 'drop'
  | 'place'
  | 'thread'
  | 'labels';

export type ComposerToolbarState = {
  mode: 'post' | 'reply' | 'quote';
  postingAsDao: boolean;
  articleMode: boolean;
  pollEnabled: boolean;
  hasDrop: boolean;
  hasMedia: boolean;
  /** Focused beat is a follow-up in the thread, not the opening post. */
  continuation: boolean;
  /** The opening post is an article, so the thread plus stays folded. */
  openingIsArticle: boolean;
  /** One beat in the composer. An article is that single piece. */
  soleBeat: boolean;
};

/**
 * Tools that cannot apply fold out of the composer row.
 * The tool that is on stays, so it can be turned off.
 * A follow-up is a post: text, photo, poll, Drop, place, and labels.
 * Post and Article are header chips, not a footer icon. The article choice
 * still folds on a continuation, once a thread exists, and while a poll or
 * Drop is on. It stays while an article is on so it can be turned off.
 * The thread plus folds while that article is on.
 */
export function composerToolbarToolShown(
  tool: ComposerToolbarTool,
  state: ComposerToolbarState
): boolean {
  const isPost = state.mode === 'post';
  switch (tool) {
    case 'media':
      return !state.pollEnabled && !state.hasDrop;
    case 'article':
      if (!isPost || state.hasDrop || state.pollEnabled || state.continuation) {
        return false;
      }
      if (state.articleMode) return true;
      return state.soleBeat;
    case 'poll':
      return isPost && !state.hasDrop && !state.articleMode;
    case 'drop':
      return (
        isPost && !state.pollEnabled && !state.articleMode && !state.hasMedia
      );
    case 'place':
      return isPost;
    case 'thread':
      return (
        isPost &&
        !state.postingAsDao &&
        !state.articleMode &&
        !state.openingIsArticle
      );
    case 'labels':
      return true;
    default:
      return false;
  }
}
