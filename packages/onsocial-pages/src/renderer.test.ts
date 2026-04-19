import { describe, expect, it } from 'vitest';
import { renderPage } from './renderer.js';
import { ogTags } from './og.js';
import { getTemplate } from './templates/index.js';
import { minimal } from './templates/minimal.js';
import { creator } from './templates/creator.js';
import type { PageData } from './types.js';

function mockPageData(overrides?: Partial<PageData>): PageData {
  return {
    accountId: 'alice.near',
    profile: {
      name: 'Alice',
      bio: 'Builder of things',
      avatar: 'https://example.com/avatar.png',
      links: [
        { label: 'GitHub', url: 'https://github.com/alice' },
        { label: 'Twitter', url: 'https://twitter.com/alice' },
      ],
      tags: ['near', 'social'],
    },
    config: {
      template: 'minimal',
      theme: { primary: '#6366f1', background: '#0f0f11' },
      sections: ['profile', 'links', 'support', 'badges'],
    },
    stats: { standingCount: 42, postCount: 10, badgeCount: 3, groupCount: 1 },
    recentPosts: [],
    badges: [{ name: 'Early Adopter' }],
    ...overrides,
  };
}

describe('ogTags', () => {
  it('generates OG meta tags from page data', () => {
    const data = mockPageData();
    const tags = ogTags(data, 'https://alice.onsocial.id');
    expect(tags).toContain('og:title');
    expect(tags).toContain('Alice');
    expect(tags).toContain('og:image');
    expect(tags).toContain('avatar.png');
    expect(tags).toContain('og:url');
    expect(tags).toContain('alice.onsocial.id');
    expect(tags).toContain('twitter:card');
  });

  it('uses accountId when name is missing', () => {
    const data = mockPageData({ profile: { bio: 'hello' } });
    const tags = ogTags(data, 'https://alice.onsocial.id');
    expect(tags).toContain('alice.near');
  });

  it('uses tagline over bio for description', () => {
    const data = mockPageData({ config: { tagline: 'Building the future' } });
    const tags = ogTags(data, 'https://alice.onsocial.id');
    expect(tags).toContain('Building the future');
  });

  it('escapes HTML in values', () => {
    const data = mockPageData({
      profile: { name: 'Alice <script>' },
    });
    const tags = ogTags(data, 'https://alice.onsocial.id');
    expect(tags).not.toContain('<script>');
    expect(tags).toContain('&lt;script&gt;');
  });
});

describe('templates', () => {
  it('getTemplate returns minimal by default', () => {
    expect(getTemplate()).toBe(minimal);
    expect(getTemplate('nonexistent')).toBe(minimal);
  });

  it('getTemplate returns creator when requested', () => {
    expect(getTemplate('creator')).toBe(creator);
  });

  describe('minimal template', () => {
    it('renders profile card with name, bio, avatar', () => {
      const html = minimal(mockPageData());
      expect(html).toContain('Alice');
      expect(html).toContain('Builder of things');
      expect(html).toContain('avatar.png');
    });

    it('renders links as buttons', () => {
      const html = minimal(mockPageData());
      expect(html).toContain('GitHub');
      expect(html).toContain('github.com/alice');
    });

    it('renders stats', () => {
      const html = minimal(mockPageData());
      expect(html).toContain('42 standing');
      expect(html).toContain('10 posts');
    });

    it('renders badges', () => {
      const html = minimal(mockPageData());
      expect(html).toContain('Early Adopter');
    });

    it('renders placeholder avatar when no avatar', () => {
      const html = minimal(mockPageData({ profile: { name: 'Bob' } }));
      expect(html).toContain('avatar-placeholder');
      expect(html).toContain('>B</div>');
    });

    it('renders stand/support buttons', () => {
      const html = minimal(mockPageData());
      expect(html).toContain('Stand With');
      expect(html).toContain('Support');
    });

    it('applies theme colors', () => {
      const data = mockPageData({
        config: { theme: { primary: '#ff0000', background: '#000000' } },
      });
      const html = minimal(data);
      expect(html).toContain('--primary: #ff0000');
      expect(html).toContain('--bg: #000000');
    });
  });

  describe('creator template', () => {
    it('renders hero section with name and stats bar', () => {
      const data = mockPageData({ config: { template: 'creator' } });
      const html = creator(data);
      expect(html).toContain('creator-page');
      expect(html).toContain('Alice');
      expect(html).toContain('42');
      expect(html).toContain('Standing');
    });

    it('renders support section with stand and tip buttons', () => {
      const data = mockPageData({
        config: { sections: ['support'] },
      });
      const html = creator(data);
      expect(html).toContain('Stand With');
      expect(html).toContain('Tip SOCIAL');
    });

    it('renders footer with OnSocial link', () => {
      const html = creator(mockPageData());
      expect(html).toContain('Powered by');
      expect(html).toContain('onsocial.id');
    });

    it('skips sections not in config', () => {
      const data = mockPageData({
        config: { sections: ['profile'] },
      });
      const html = creator(data);
      expect(html).not.toContain('id="links"');
      expect(html).not.toContain('id="support"');
    });
  });
});

describe('renderPage', () => {
  it('produces a full HTML document', () => {
    const html = renderPage(mockPageData(), 'https://alice.onsocial.id');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<title>Alice — OnSocial</title>');
    expect(html).toContain('og:title');
    expect(html).toContain('Inter');
  });

  it('includes custom CSS when provided', () => {
    const data = mockPageData({
      config: { customCss: '.page-card { border: 1px solid red; }' },
    });
    const html = renderPage(data, 'https://alice.onsocial.id');
    expect(html).toContain('border: 1px solid red');
  });

  it('strips script injection from custom CSS', () => {
    const data = mockPageData({
      config: { customCss: '</style><script>alert(1)</script>' },
    });
    const html = renderPage(data, 'https://alice.onsocial.id');
    expect(html).not.toContain('<script>alert');
  });

  it('strips javascript: from custom CSS', () => {
    const data = mockPageData({
      config: { customCss: 'background: url(javascript:alert(1))' },
    });
    const html = renderPage(data, 'https://alice.onsocial.id');
    expect(html).not.toContain('javascript:');
  });

  it('uses the correct template based on config', () => {
    const data = mockPageData({ config: { template: 'creator' } });
    const html = renderPage(data, 'https://alice.onsocial.id');
    expect(html).toContain('creator-page');
  });

  it('includes stub JS for standWith and support', () => {
    const html = renderPage(mockPageData(), 'https://alice.onsocial.id');
    expect(html).toContain('function standWith');
    expect(html).toContain('function support');
  });
});
