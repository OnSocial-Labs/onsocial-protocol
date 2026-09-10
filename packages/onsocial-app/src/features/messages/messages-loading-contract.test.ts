import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const messagesDir = dirname(fileURLToPath(import.meta.url));

describe('messages loading contract', () => {
  it('derives cold, refresh, and thread error presentation from the shared contract', () => {
    const source = readFileSync(join(messagesDir, 'messages-panel.tsx'), 'utf8');

    expect(source).toContain('resolveAppLoadingPresentation');
    expect(source).toContain('loadingThreads');
    expect(source).toContain('refreshingThreads');
    expect(source).toContain('loadingMessages');
    expect(source).toContain('refreshingMessages');
    expect(source).toContain('showThreadListSkeleton');
    expect(source).toContain('showThreadSkeleton');
    expect(source).toContain("setErrorSource('thread')");
  });

  it('keeps painted rows and appends distinct message skeletons', () => {
    const rowsSource = readFileSync(
      join(messagesDir, 'messages-inbox-rows.tsx'),
      'utf8'
    );
    const skeletonSource = readFileSync(
      join(messagesDir, 'messages-thread-skeleton.tsx'),
      'utf8'
    );

    expect(rowsSource).toContain('MessagesInboxSkeleton');
    expect(rowsSource).toContain('messages-inbox-list--refreshing');
    expect(rowsSource).toContain('aria-busy={refreshing || undefined}');
    expect(skeletonSource).toContain('MessagesThreadAppendSkeleton');
    expect(skeletonSource).toContain('data-messages-append-skeleton');
  });
});
