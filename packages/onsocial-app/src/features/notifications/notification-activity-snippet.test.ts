import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const rows = readFileSync(join(here, 'notification-activity-rows.tsx'), 'utf8');
const richText = readFileSync(
  join(here, '../home/post-rich-text.tsx'),
  'utf8'
);
const css = readFileSync(join(here, '../../app/globals.css'), 'utf8');
const feedMeta = readFileSync(join(here, '../../app/feed-meta.css'), 'utf8');

describe('notification activity snippets', () => {
  it('paints post quotes through display-only PostRichText', () => {
    expect(rows).toContain("from '@/features/home/post-rich-text'");
    expect(rows).toContain(
      '<PostRichText text={snippet} interactive={false} emptyFallback="" />'
    );
    expect(richText).toContain('interactive = true');
    expect(richText).toContain("as={interactive ? 'a' : 'span'}");
    expect(richText).toContain('<span key={`m-${index}`} className="os-mention">');
  });

  it('badges likes, stands, and anniversary on the standing lead', () => {
    expect(rows).toContain('notificationActivityBadgeKind');
    expect(rows).toContain('notificationLeadAccountId');
    expect(rows).toContain('avatarBadge');
    expect(rows).toContain('ActivityTypeBadge');
    expect(rows).toContain('HeartFillIcon');
    expect(rows).toContain('UserFillIcon');
    expect(rows).toContain('StarMovingFillIcon');
    expect(rows).toContain('anniversary: StarsCFillIcon');
    expect(rows).toContain('stand: UserFillIcon');
    expect(css).toContain('--signal-standing');
    expect(css).toContain('--signal-reputation');
    expect(css).toContain('--signal-endorse');
    expect(css).toContain('--app-on-media-ink');
    expect(css).toContain('.notifications-activity-badge--anniversary');
    expect(css).toContain('.notifications-activity-badge--stand');
    expect(css).toMatch(
      /\.notifications-activity-badge--mention,[\s\S]*background-color: var\(--signal-standing/
    );
    expect(css).toMatch(
      /\.notifications-activity-badge--sale \{[\s\S]*background-color: var\(--signal-reputation/
    );
    expect(css).toMatch(
      /\.notifications-activity-badge--proposal \{[\s\S]*background-color: #64748b/
    );
    expect(css).toContain('.notifications-activity-mark--scarces');
    expect(css).toContain('.notifications-activity-mark--dao');
  });

  it('locks Activity copy and snippet tokens to DM Sans', () => {
    expect(css).toMatch(
      /\.notifications-activity-verb \{\s*margin: 0;\s*font-family: var\(--app-font-sans\);/
    );
    expect(css).toMatch(
      /\.notifications-activity-place,\s*\.notifications-activity-snippet \{\s*display: block;[\s\S]*font-family: var\(--app-font-sans\);/
    );
    expect(feedMeta).toContain('.notifications-activity-snippet');
    expect(feedMeta).toMatch(
      /\.notifications-activity-snippet\s+:is\(\.os-hashtag, \.os-mention, \.os-ticker, \.os-link\) \{\s*font-family: inherit;/
    );
  });
});
