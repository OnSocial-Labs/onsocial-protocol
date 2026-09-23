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
};

/**
 * Tools that cannot apply fold out of the composer row.
 * The tool that is on stays, so it can be turned off.
 * The thread plus is a post control. An article is one piece, so the plus folds away.
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
      return isPost && !state.hasDrop && !state.pollEnabled;
    case 'poll':
      return isPost && !state.hasDrop && !state.articleMode;
    case 'drop':
      return (
        isPost && !state.pollEnabled && !state.articleMode && !state.hasMedia
      );
    case 'place':
      return isPost;
    case 'thread':
      return isPost && !state.postingAsDao && !state.articleMode;
    case 'labels':
      return true;
    default:
      return false;
  }
}
