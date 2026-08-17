import { describe, expect, it } from 'vitest';
import {
  osCommitActionsClassName,
  osCommitCancelClassName,
  osNoticeCardClassName,
} from './os-notice-card.js';

describe('os-notice-card class names', () => {
  it('exports stable class names', () => {
    expect(osNoticeCardClassName).toBe('os-notice-card');
    expect(osCommitActionsClassName).toBe('os-commit-actions');
    expect(osCommitCancelClassName).toBe('os-commit-cancel');
  });
});
