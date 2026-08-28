import { describe, expect, it } from 'vitest';
import {
  osSheetActionClassName,
  OsSheetAction,
  resolveOsSheetActionState,
} from './os-sheet-action.js';

describe('OsSheetAction', () => {
  it('exports the shared sheet action class', () => {
    expect(osSheetActionClassName).toBe('os-sheet-action');
  });

  it('exports the sheet action button', () => {
    expect(typeof OsSheetAction).toBe('function');
  });
});

describe('resolveOsSheetActionState', () => {
  const base = {
    pending: false,
    succeeded: false,
    failed: false,
  } as const;

  it('arms pill variants on ready', () => {
    for (const variant of ['primary', 'danger', 'dismiss'] as const) {
      const state = resolveOsSheetActionState({
        ...base,
        variant,
        ready: true,
      });
      expect(state.isReady).toBe(true);
      expect(state.isDisabled).toBe(false);
    }
  });

  it('never arms ghost — it is always interactive', () => {
    const state = resolveOsSheetActionState({
      ...base,
      variant: 'ghost',
      ready: true,
    });
    expect(state.isReady).toBe(false);
    expect(state.isDisabled).toBe(false);
  });

  it('supports the full state machine on ghost', () => {
    const pending = resolveOsSheetActionState({
      ...base,
      variant: 'ghost',
      pending: true,
    });
    expect(pending.isPending).toBe(true);
    expect(pending.isDisabled).toBe(true);

    const succeeded = resolveOsSheetActionState({
      ...base,
      variant: 'ghost',
      succeeded: true,
    });
    expect(succeeded.isSucceeded).toBe(true);
    expect(succeeded.isDisabled).toBe(true);

    const failed = resolveOsSheetActionState({
      ...base,
      variant: 'ghost',
      failed: true,
    });
    expect(failed.isFailed).toBe(true);
    expect(failed.isDisabled).toBe(false);
  });

  it('lets pending and succeeded win over ready', () => {
    const pending = resolveOsSheetActionState({
      ...base,
      variant: 'primary',
      ready: true,
      pending: true,
    });
    expect(pending.isReady).toBe(false);
    expect(pending.isDisabled).toBe(true);

    const succeeded = resolveOsSheetActionState({
      ...base,
      variant: 'primary',
      ready: true,
      succeeded: true,
    });
    expect(succeeded.isReady).toBe(false);
    expect(succeeded.isDisabled).toBe(true);
  });

  it('treats failed as non-disabling and loses to succeeded', () => {
    const state = resolveOsSheetActionState({
      ...base,
      variant: 'danger',
      failed: true,
      succeeded: true,
    });
    expect(state.isFailed).toBe(false);
    expect(state.isSucceeded).toBe(true);
  });

  it('resolves the active toggle without disabling', () => {
    const state = resolveOsSheetActionState({
      ...base,
      variant: 'primary',
      ready: true,
      active: true,
    });
    expect(state.isActive).toBe(true);
    expect(state.isReady).toBe(true);
    expect(state.isDisabled).toBe(false);
  });

  it('drops active while pending or succeeded', () => {
    const pending = resolveOsSheetActionState({
      ...base,
      variant: 'primary',
      active: true,
      pending: true,
    });
    expect(pending.isActive).toBe(false);

    const succeeded = resolveOsSheetActionState({
      ...base,
      variant: 'primary',
      active: true,
      succeeded: true,
    });
    expect(succeeded.isActive).toBe(false);
  });
});
