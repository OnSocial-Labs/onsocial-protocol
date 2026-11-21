import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const peek = readFileSync(join(here, 'thread-discover-peek.tsx'), 'utf8');
const quotes = readFileSync(join(here, 'post-quotes-panel.tsx'), 'utf8');

describe('secondary PostCard hosts share bare-repost resolve', () => {
  it('holds discover peeks until bare-repost originals settle', () => {
    expect(peek).toContain('ResolvedFeedPostCard');
    expect(peek).toContain('isBareRepostShell');
    expect(peek).toContain('peekNeedsRefBody');
    expect(peek).toContain('ThreadDiscoverPeekSeat');
    expect(peek).toContain('PostRowSkeleton');
    expect(peek).toContain('allowEmptyCollapse');
    // Seat mirrors content: title line + one card — no 2-row height drop.
    expect(peek).toContain('thread-discover-peek-title');
    expect(peek).toContain('rows={1}');
    expect(peek).not.toContain('<PostCard');
  });

  it('renders quotes through the shared resolve wrapper', () => {
    expect(quotes).toContain('ResolvedFeedPostCard');
    expect(quotes).not.toContain('<PostCard');
    expect(quotes).not.toContain('resolveQuotedInset');
  });
});
