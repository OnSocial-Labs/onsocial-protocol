import { describe, expect, it } from 'vitest';
import {
  composerToolbarToolShown,
  type ComposerToolbarState,
  type ComposerToolbarTool,
} from './composer-toolbar';

const TOOLS: ComposerToolbarTool[] = [
  'media',
  'article',
  'poll',
  'drop',
  'place',
  'thread',
  'labels',
];

function shown(state: ComposerToolbarState): ComposerToolbarTool[] {
  return TOOLS.filter((tool) => composerToolbarToolShown(tool, state));
}

const freshPost: ComposerToolbarState = {
  mode: 'post',
  postingAsDao: false,
  articleMode: false,
  pollEnabled: false,
  hasDrop: false,
  hasMedia: false,
};

describe('composerToolbarToolShown', () => {
  it('shows every tool on a new post', () => {
    expect(shown(freshPost)).toEqual(TOOLS);
  });

  it('folds poll, Drop, and the thread plus while an article is on', () => {
    expect(shown({ ...freshPost, articleMode: true })).toEqual([
      'media',
      'article',
      'place',
      'labels',
    ]);
  });

  it('folds photo, article, and Drop while a poll is on', () => {
    expect(shown({ ...freshPost, pollEnabled: true })).toEqual([
      'poll',
      'place',
      'thread',
      'labels',
    ]);
  });

  it('folds photo, article, and poll while a Drop is on', () => {
    expect(shown({ ...freshPost, hasDrop: true })).toEqual([
      'drop',
      'place',
      'thread',
      'labels',
    ]);
  });

  it('folds Drop once photos are attached', () => {
    expect(shown({ ...freshPost, hasMedia: true })).toEqual([
      'media',
      'article',
      'poll',
      'place',
      'thread',
      'labels',
    ]);
  });

  it('keeps the thread choice on a short new post', () => {
    expect(composerToolbarToolShown('thread', freshPost)).toBe(true);
  });

  it('folds new-post tools on a reply and a quote', () => {
    for (const mode of ['reply', 'quote'] as const) {
      expect(shown({ ...freshPost, mode })).toEqual(['media', 'labels']);
    }
  });

  it('folds the thread plus on a DAO Call and keeps the other post tools', () => {
    expect(shown({ ...freshPost, postingAsDao: true })).toEqual([
      'media',
      'article',
      'poll',
      'drop',
      'place',
      'labels',
    ]);
  });
});
