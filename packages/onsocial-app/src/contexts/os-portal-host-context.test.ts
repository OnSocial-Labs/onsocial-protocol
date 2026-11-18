// @vitest-environment jsdom
import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  OsPortalHostProvider,
  useOsPortalHost,
  useRegisterOsPortalHost,
} from '@/contexts/os-portal-host-context';

function Card({ testId }: { testId: string }) {
  const ref = useRegisterOsPortalHost<HTMLDivElement>();
  return createElement('div', { ref, 'data-testid': testId });
}

function Chosen() {
  const host = useOsPortalHost();
  return createElement(
    'div',
    { 'data-testid': 'chosen' },
    host?.dataset.testid ?? 'none'
  );
}

describe('OsPortalHostProvider', () => {
  it('keeps the outer card when a later host mounts inside a glass sheet', async () => {
    render(
      createElement(
        OsPortalHostProvider,
        null,
        createElement(Chosen),
        createElement(Card, { testId: 'outer' }),
        createElement(
          'div',
          { className: 'glass-sheet-root' },
          createElement(Card, { testId: 'inner' })
        )
      )
    );

    expect((await screen.findByTestId('chosen')).textContent).toBe('outer');
  });
});
