import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const guildDir = dirname(fileURLToPath(import.meta.url));

describe('guild loading contract', () => {
  it('maps the shell and feed phases through the shared contract', () => {
    const source = readFileSync(join(guildDir, 'live-guild-panel.tsx'), 'utf8');

    expect(source).toContain('resolveAppLoadingPresentation');
    expect(source).toContain('shellPresentation');
    expect(source).toContain('feedPresentation');
    expect(source).toContain('GuildPageHeroSkeleton');
    expect(source).toContain('GuildFeedFilterSkeleton');
    expect(source).toContain('data-guild-page-skeleton');
  });

  it('preserves painted feed rows and exposes append/error states', () => {
    const source = readFileSync(join(guildDir, 'live-guild-panel.tsx'), 'utf8');

    expect(source).toContain("showFeedRefreshing ? ' is-refreshing' : ''");
    expect(source).toContain('showFeedAppendSkeleton');
    expect(source).toContain('Guild posts could not refresh');
    expect(source).toContain('GUILD_FEED_LOAD_MORE_ERROR');
  });
});
