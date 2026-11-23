// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { OsLateFill } from '@/components/app/os-late-fill';

afterEach(() => {
  cleanup();
});

describe('OsLateFill', () => {
  it('paints seeded content opaque without pending', () => {
    const { container, rerender } = render(
      createElement(
        OsLateFill,
        { className: 'collection-about-seat' },
        createElement('span', null, 'Seeded story')
      )
    );
    const seat = container.firstElementChild as HTMLElement;
    expect(seat.className).toContain('os-late-fill');
    expect(seat.className).toContain('is-seeded');
    expect(seat.className).not.toContain('is-pending');
    expect(seat.className).not.toContain('is-ready');
    rerender(
      createElement(
        OsLateFill,
        { className: 'collection-about-seat' },
        createElement('span', null, 'Seeded story')
      )
    );
    expect(seat.className).toContain('is-seeded');
  });

  it('appears once when content fills an empty seat', () => {
    const { container, rerender } = render(
      createElement(OsLateFill, { className: 'collection-about-seat' }, null)
    );
    let seat = container.firstElementChild as HTMLElement;
    expect(seat.className).not.toContain('is-seeded');
    expect(seat.className).not.toContain('is-ready');

    rerender(
      createElement(
        OsLateFill,
        { className: 'collection-about-seat' },
        createElement('span', null, 'Late story')
      )
    );
    seat = container.firstElementChild as HTMLElement;
    expect(seat.className).toContain('is-ready');
    expect(seat.className).not.toContain('is-seeded');
    expect(seat.textContent).toBe('Late story');
  });
});
