import { describe, expect, it } from 'vitest';
import {
  APP_APPS_PATH,
  APP_DAOS_PATH,
  APP_DROPS_PATH,
  APP_GROUPS_PATH,
  APP_HOME_PATH,
} from '@/lib/app-routes';
import {
  OS_LEAVE_HOME_INDEX_IDS,
  OS_LEAVE_MAP,
  osLeaveRowsByVerdict,
} from '@/lib/os-leave-map';
import { OS_INDEX_LEAVE_HREF } from '@/lib/os-leave';

function row(id: (typeof OS_LEAVE_MAP)[number]['id']) {
  const found = OS_LEAVE_MAP.find((entry) => entry.id === id);
  if (!found) throw new Error(`missing leave-map row ${id}`);
  return found;
}

describe('os leave map', () => {
  it('keeps Home as the daily root with no dock Back', () => {
    expect(row('home')).toMatchObject({
      dockBack: false,
      parent: null,
      verdict: 'matches',
    });
    expect(OS_INDEX_LEAVE_HREF).toBe(APP_HOME_PATH);
    expect(OS_INDEX_LEAVE_HREF).not.toBe('/');
  });

  it('sends matching indexes to Home, including Drops', () => {
    expect(OS_LEAVE_HOME_INDEX_IDS).toContain('drops-index');
    for (const id of OS_LEAVE_HOME_INDEX_IDS) {
      expect(row(id)).toMatchObject({
        dockBack: true,
        parent: OS_INDEX_LEAVE_HREF,
        verdict: 'matches',
      });
    }
  });

  it('has no open leave decisions', () => {
    expect(osLeaveRowsByVerdict('needs-decision')).toEqual([]);
  });

  it('sends create places to their index', () => {
    expect(row('guild-create').parent).toBe(APP_GROUPS_PATH);
    expect(row('hub-create').parent).toBe(APP_APPS_PATH);
    expect(row('dao-create').parent).toBe(APP_DAOS_PATH);
    expect(row('drop-create').parent).toBe(APP_DROPS_PATH);
  });

  it('sends visitor drops to Drops', () => {
    expect(row('drop')).toMatchObject({
      parent: APP_DROPS_PATH,
      verdict: 'matches',
    });
    expect(row('drop-loading')).toMatchObject({
      parent: APP_DROPS_PATH,
      verdict: 'matches',
    });
  });

  it('leaves the portfolio face to Home', () => {
    expect(row('portfolio-face')).toMatchObject({
      dockBack: true,
      parent: APP_HOME_PATH,
      verdict: 'matches',
    });
  });

  it('lists only play-loading as a leftover mismatch', () => {
    expect(osLeaveRowsByVerdict('mismatch').map((entry) => entry.id)).toEqual([
      'collectibles-play-loading',
    ]);
  });
});
