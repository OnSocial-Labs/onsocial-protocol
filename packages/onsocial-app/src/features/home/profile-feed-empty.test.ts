import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const homeSrc = dirname(fileURLToPath(import.meta.url));

describe('profile feed empty state contract', () => {
  it('gives the owner a compose action on the main posts empty state', () => {
    const source = readFileSync(
      join(homeSrc, 'profile-feed-client.tsx'),
      'utf8'
    );

    expect(source).toContain('openPost');
    expect(source).toContain('showOwnerComposeAction');
    expect(source).toContain(
      "isOwner && (tab ? tab === 'posts' : total === 0)"
    );
    expect(source).toContain('className="profile-feed-compose-teaser"');
    expect(source).toContain('Write your first post.');
    expect(source).toContain('onClick={() => openPost()}');
  });

  it('drops the passive pen hint and keeps visitor copy unchanged', () => {
    const source = readFileSync(
      join(homeSrc, 'profile-feed-client.tsx'),
      'utf8'
    );

    expect(source).not.toContain('Use the pen to post.');
    expect(source).toContain("'Nothing published yet.'");
  });

  it('keeps the per-tab owner hints on replies, reposts, and media', () => {
    const source = readFileSync(
      join(homeSrc, 'profile-feed-client.tsx'),
      'utf8'
    );

    expect(source).toContain('Reply to a post and it will show up here.');
    expect(source).toContain('Repost something and it will show up here.');
    expect(source).toContain('Posts with photos or video will show up here.');
  });

  it('styles the teaser as a composer-like tappable row', () => {
    const css = readFileSync(join(homeSrc, '../../app/globals.css'), 'utf8');

    expect(css).toContain('.profile-feed-compose-teaser');
    expect(css).toContain('cursor: text');
  });
});
