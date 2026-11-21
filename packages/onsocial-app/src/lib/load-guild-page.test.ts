import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = dirname(fileURLToPath(import.meta.url));

describe('loadGuildPageData keyset SSR', () => {
  it('seeds hasMore from feedPageHasMore and keeps both keyset cursors', () => {
    const source = readFileSync(join(dir, 'load-guild-page.ts'), 'utf8');
    expect(source).toContain('feedPageHasMore(feed)');
    expect(source).toContain('nextBeforeBlockHeight: feed.nextBeforeBlockHeight');
    expect(source).toContain('nextBeforeEventKey: feed.nextBeforeEventKey');
    expect(source).not.toContain('feed.nextOffset !== undefined');
  });

  it('client SSR seed keeps the dual cursors instead of clearing them', () => {
    const client = readFileSync(
      join(dir, '../features/guilds/use-guild-page-data.ts'),
      'utf8'
    );
    expect(client).toContain(
      'nextBeforeBlockHeightRef.current = initial.nextBeforeBlockHeight'
    );
    expect(client).toContain(
      'nextBeforeEventKeyRef.current = initial.nextBeforeEventKey'
    );
    expect(client).toContain(
      'nextBeforeBlockHeight: initial.nextBeforeBlockHeight'
    );
    expect(client).toContain('nextBeforeEventKey: initial.nextBeforeEventKey');
    expect(client).not.toMatch(
      /Cursor lands with the first keyed page — don't invent one from SSR/
    );
  });
});
