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
    expect(source).toContain('loadingInitial');
    expect(source).toContain('loadingPresentation');
    expect(source).toContain('showActivitySkeleton');
    expect(source).toContain('showActivityRefreshing');
    expect(source).toContain('showAppendSkeleton');
    expect(source).toContain('errorPresentation');
  });

  it('preserves painted activity on refresh and appends distinct skeleton rows', () => {
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
    expect(source).toContain('NotificationActivityAppendSkeleton');
    expect(source).toContain('errorSource');
    expect(rowsSource).toContain('data-notifications-append-skeleton');
    expect(rowsSource).toContain('notifications-activity-row--skeleton');
    expect(rowsSource).not.toContain(
      'className="standing-row notifications-activity-row"'
    );
  });
});
