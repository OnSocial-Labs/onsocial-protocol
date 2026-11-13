import { describe, expect, it } from 'vitest';
import { appAccessBannerCopy } from '@/lib/app-access-banner';

describe('appAccessBannerCopy', () => {
  it('stays hidden until the session check has finished', () => {
    expect(
      appAccessBannerCopy({ settled: false, lifecycle: 'missing' })
    ).toBeNull();
    expect(appAccessBannerCopy({ settled: false, lifecycle: null })).toBeNull();
  });

  it('shows Allow when this device has no app access', () => {
    expect(
      appAccessBannerCopy({ settled: true, lifecycle: 'missing' })
    ).toEqual({
      title: 'Allow app access',
      body: 'So you can post and message without signing every action.',
      action: 'Allow access',
    });
  });

  it('shows Renew when app access has expired', () => {
    expect(
      appAccessBannerCopy({ settled: true, lifecycle: 'expired' })
    ).toEqual({
      title: 'Renew app access',
      body: 'So you can post and message without signing every action.',
      action: 'Renew access',
    });
  });

  it('hides once app access is active', () => {
    expect(
      appAccessBannerCopy({ settled: true, lifecycle: 'active' })
    ).toBeNull();
  });
});
