import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const notificationsSrc = dirname(fileURLToPath(import.meta.url));

describe('notifications loading contract', () => {
  it('derives cold, refresh, append, and error presentation from the shared contract', () => {
    const source = readFileSync(
      join(notificationsSrc, 'notifications-panel.tsx'),
      'utf8'
    );

    expect(source).toContain('resolveAppLoadingPresentation');
    expect(source).toContain('authPending');
    expect(source).toContain('loadingInitial');
    expect(source).toContain('loadingPresentation');
    expect(source).toContain('showActivitySkeleton');
    expect(source).toContain('showActivityRefreshing');
    expect(source).toContain('showAppendPending');
    expect(source).toContain("loadingPresentation === 'append-pending'");
    expect(source).toContain('PulsingDots');
    expect(source).toContain('showRestoredInbox');
    expect(source).toContain('peekActivityInboxSession');
    expect(source).toContain('errorPresentation');
    expect(source).not.toContain('showAppendSkeleton');
    expect(source).not.toContain('NotificationActivityAppendSkeleton');
  });

  it('preserves painted activity on refresh and appends footer pending dots', () => {
    const source = readFileSync(
      join(notificationsSrc, 'notifications-panel.tsx'),
      'utf8'
    );
    const rowsSource = readFileSync(
      join(notificationsSrc, 'notification-activity-rows.tsx'),
      'utf8'
    );

    expect(source).toContain('setItems((current) => current ?? [])');
    expect(source).toContain('refreshing={showActivityRefreshing}');
    expect(source).toContain('list-append-pending');
    expect(source).toContain('errorSource');
    expect(rowsSource).not.toContain('data-notifications-append-skeleton');
    expect(rowsSource).toContain('notifications-activity-row--skeleton');
  });
});
