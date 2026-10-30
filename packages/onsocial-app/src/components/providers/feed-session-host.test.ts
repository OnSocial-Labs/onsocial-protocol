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
  it('mounts the Home feed in the shell and drops it after a leave', () => {
    const host = readFileSync(join(here, 'feed-session-host.tsx'), 'utf8');
    const providers = readFileSync(join(here, 'app-providers.tsx'), 'utf8');
    const route = readFileSync(
      join(here, '../../app/(app)/home/page.tsx'),
      'utf8'
    );

    expect(host).toContain('<HomePagePanel />');
    expect(host).toContain('let feedTree = page');
    expect(host).toContain('retainFeed ? openedFeed');
    expect(host).toContain('shouldRetainOpenedFeed');
    expect(host).toContain('WritingShelfOpening');
    expect(host).toContain('setKeepFeed');
    expect(host).toContain('if (onFeed && !keepFeed)');
    expect(host).not.toContain("display: 'none'");
    expect(host).not.toContain('loadHomeFeedPage');
    expect(host).toContain('data-feed-session');
    expect(providers).toContain('FeedSessionHost');
    expect(providers).toContain('page={children}');
    expect(route).toContain('loadHomeFeedPage');
    expect(route).toContain('shouldSeedHomeFeedPage');
    expect(route).toContain("headers()).get('rsc')");
    expect(route).toContain('HOME_FEED_SESSION_HINT_COOKIE');
    expect(route).toContain('hasSavedList');
    expect(route).toContain('HomeFeedRoute');
    expect(route).toContain('parseHomeFeedFocus');
    expect(route).not.toContain('HomePagePanel');
  });
});
