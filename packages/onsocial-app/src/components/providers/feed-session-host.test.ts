import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { APP_HOME_PATH } from '@/lib/app-routes';
import { isFeedSessionPath } from './feed-session-host';

const here = dirname(fileURLToPath(import.meta.url));

describe('feed session path', () => {
  it('is only the home feed route', () => {
    expect(isFeedSessionPath(APP_HOME_PATH)).toBe(true);
    expect(isFeedSessionPath('/home/')).toBe(false);
    expect(isFeedSessionPath('/@alice.near')).toBe(false);
    expect(isFeedSessionPath('/@alice.near/writing/42')).toBe(false);
    expect(isFeedSessionPath('/discover')).toBe(false);
  });
});

describe('feed session host wiring', () => {
  it('keeps one Home feed mounted in the app shell', () => {
    const host = readFileSync(join(here, 'feed-session-host.tsx'), 'utf8');
    const providers = readFileSync(join(here, 'app-providers.tsx'), 'utf8');
    const route = readFileSync(
      join(here, '../../app/(app)/home/page.tsx'),
      'utf8'
    );

    expect(host).toContain('HomePagePanel');
    expect(host).toContain("visibility: 'hidden'");
    expect(host).toContain('if (onFeed) setMounted(true)');
    expect(host).toContain('data-feed-session');
    expect(providers).toContain('FeedSessionHost');
    expect(route).not.toContain('HomePagePanel');
    expect(route).not.toContain('loadHomeFeedPage');
  });
});
