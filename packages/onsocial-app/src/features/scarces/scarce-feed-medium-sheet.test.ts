import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resolveScarceFeedMediumMode } from '@/features/scarces/scarce-feed-medium-mode';

const here = dirname(fileURLToPath(import.meta.url));

describe('resolveScarceFeedMediumMode', () => {
  it('maps audio / writing / other to shell modes', () => {
    expect(resolveScarceFeedMediumMode('audio')).toBe('audio');
    expect(resolveScarceFeedMediumMode('music')).toBe('audio');
    expect(resolveScarceFeedMediumMode('writing')).toBe('writing');
    expect(resolveScarceFeedMediumMode('article')).toBe('writing');
    expect(resolveScarceFeedMediumMode('issue')).toBe('writing');
    expect(resolveScarceFeedMediumMode('book')).toBe('writing');
    expect(resolveScarceFeedMediumMode('art')).toBe('viewer');
    expect(resolveScarceFeedMediumMode('thought')).toBe('viewer');
    expect(resolveScarceFeedMediumMode(null)).toBe('viewer');
  });
});

describe('ScarceFeedMediumSheet listen open', () => {
  it('mounts the listen face for audio without a Loading shell remount', () => {
    const source = readFileSync(
      join(here, 'scarce-feed-medium-sheet.tsx'),
      'utf8'
    );
    expect(source).toContain('PENDING_FEED_AUDIO_CLIP');
    expect(source).toContain(
      'const immersiveAudio = mode === \'audio\' && open && clip != null'
    );
    expect(source).toContain('const isOverlay = mode === \'viewer\'');
    expect(source).not.toContain("mode === 'audio' && !clip");
    expect(source).not.toContain('Loading audio…');
  });

  it('cold shared-drop autoplay reads the live track when the URL lands', () => {
    const player = readFileSync(join(here, 'scarce-clip-player.tsx'), 'utf8');
    // PENDING seat + URL effect must not keep a closed-over empty clip.
    expect(player).toContain('feedOpenPlaylistRef');
    expect(player).toContain('feedOpenClipRef');
    expect(player).toContain(
      'feedOpenPlaylistRef.current[feedOpenIndexRef.current]'
    );
    expect(player).toContain('feedOpenTryStartRef.current?.()');
  });
});
