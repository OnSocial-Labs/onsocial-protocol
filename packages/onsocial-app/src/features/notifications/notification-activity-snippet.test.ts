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
const badgeCss = readFileSync(
  join(here, 'notification-activity-badges.css'),
  'utf8'
);
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
    expect(rows).toContain("import './notification-activity-badges.css'");
    expect(rows).toContain('ACTIVITY_BADGE_INK');
    expect(badgeCss).toContain('--signal-standing');
    expect(badgeCss).toContain('--signal-reputation');
    expect(badgeCss).toContain('--signal-endorse');
    expect(badgeCss).toContain('--bg');
    expect(badgeCss).toContain("[data-activity-badge='anniversary']");
    expect(badgeCss).toContain("[data-activity-badge='mention']");
    expect(badgeCss).toContain("[data-activity-badge='sale']");
    expect(badgeCss).toContain("[data-activity-badge='proposal']");
    expect(badgeCss).toContain("[data-activity-badge='repost']");
    expect(badgeCss).toContain('stroke-width: 3');
    expect(css).toContain('.notifications-activity-mark--scarces');
    expect(css).toContain('.notifications-activity-mark--dao');
  });

  it('paints feed-style name plus account id, with the verb under', () => {
    expect(rows).toContain('showHandle={false}');
    expect(rows).toContain('ActivityFeedIdentity');
    expect(rows).toContain('className="post-identity-handle"');
    expect(rows).toContain('<ActivityVerb verb={verb} />');
    expect(rows).toContain('<ActivityHint place={placeName} snippet={snippet} />');
    expect(rows).toContain(
      'className="standing-row-bio notifications-activity-snippet"'
    );
    expect(rows).toContain('className="notifications-activity-place"');
    expect(rows).toContain('className="standing-row-sep"');
    expect(css).toMatch(
      /\.notifications-activity-list \{\s*margin: 0;\s*min-width: 0;\s*font-family: var\(--app-font-sans\);/
    );
    expect(feedMeta).toContain(
      '.notifications-activity-list\n  .standing-row-bio'
    );
    expect(feedMeta).toContain('pointer-events: none');
  });
});
