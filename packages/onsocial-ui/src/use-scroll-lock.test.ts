/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { findDefaultScrollLockContainer } from './use-scroll-lock.js';

describe('findDefaultScrollLockContainer', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('locks a body that itself carries data-feed-session=covered', () => {
    const body = document.createElement('main');
    body.className = 'os-app-screen-body';
    body.setAttribute('data-feed-session', 'covered');
    document.body.appendChild(body);

    expect(findDefaultScrollLockContainer()).toBe(body);
  });

  it('skips a body nested under a covered host', () => {
    const host = document.createElement('div');
    host.setAttribute('data-feed-session', 'covered');
    const nested = document.createElement('main');
    nested.className = 'os-app-screen-body';
    host.appendChild(nested);
    const underlay = document.createElement('main');
    underlay.className = 'os-app-screen-body';
    document.body.append(host, underlay);

    expect(findDefaultScrollLockContainer()).toBe(underlay);
  });
});
