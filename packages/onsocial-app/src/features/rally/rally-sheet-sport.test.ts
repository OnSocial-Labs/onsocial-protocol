import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RallySheetSport } from '@/features/rally/rally-sheet-sport';

vi.mock('next/navigation', () => ({
  usePathname: () => '/home',
  useRouter: () => ({ push: () => undefined }),
}));

describe('RallySheetSport', () => {
  it('links every face, including yours, with no extra copy', () => {
    const html = renderToStaticMarkup(
      createElement(RallySheetSport, {
        rows: [
          { rank: 2, score: 80, accountId: 'b.near', displayName: 'Bea' },
          { rank: 3, score: 70, accountId: 'you.near' },
          { rank: 4, score: 60, accountId: 'd.near', displayName: 'Dee' },
        ],
      })
    );
    expect(html).toContain('href="/@b.near"');
    expect(html).toContain('href="/@you.near"');
    expect(html).toContain('href="/@d.near"');
    expect(html).toContain('os-media-face-identity');
    expect(html).toContain('profile-avatar--sm');
    expect(html).toContain('>2<');
    expect(html).not.toContain('#2');
    expect(html).not.toContain('type="button"');
    expect(html).not.toContain('SOCIAL');
    expect(html).not.toContain('Stand, endorse');
    expect(html).not.toContain('are carrying you');
    expect(html).not.toContain('Full standings');
  });

  it('shows the shared avatar + name + @id so duplicate names stay distinguishable', () => {
    const html = renderToStaticMarkup(
      createElement(RallySheetSport, {
        rows: [
          {
            rank: 1,
            score: 90,
            accountId: 'alice.near',
            displayName: 'Al',
            avatarUrl: 'https://img.example/alice.png',
          },
          { rank: 2, score: 80, accountId: 'alice.tg', displayName: 'Al' },
          { rank: 3, score: 70, accountId: 'you.near' },
        ],
      })
    );
    expect(html).toContain('@alice.near');
    expect(html).toContain('@alice.tg');
    expect(html).toContain('@you.near');
    expect(html).toContain('https://img.example/alice.png');
    expect(html).toContain('profile-avatar__img');
    expect(html).toContain('profile-avatar__initial');
    expect(html).toContain('View Al&#x27;s profile');
    expect(html).toContain('View You&#x27;s profile');
  });

  it('renders nothing when the board is empty', () => {
    const html = renderToStaticMarkup(
      createElement(RallySheetSport, {
        rows: [],
      })
    );
    expect(html).toBe('');
  });
});
