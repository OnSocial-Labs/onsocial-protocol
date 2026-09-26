import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { dropDeleteConfirmCopy } from './drop-delete-confirm-copy';

describe('drop delete confirm copy', () => {
  it('keeps drop wording for a drop', () => {
    expect(dropDeleteConfirmCopy({ title: 'Night' })).toEqual({
      title: 'Delete Night?',
      body: 'This removes the drop if nothing was minted. You can’t undo it.',
      confirmLabel: 'Delete drop',
    });
  });

  it('speaks event when the row is an event', () => {
    expect(dropDeleteConfirmCopy({ title: 'Meet Merv', noun: 'event' })).toEqual(
      {
        title: 'Delete Meet Merv?',
        body: 'This removes the event if no tickets were minted. You can’t undo it.',
        confirmLabel: 'Delete event',
      }
    );
  });
});

describe('event row menu', () => {
  const panel = readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      '../features/events/events-page-panel.tsx'
    ),
    'utf8'
  );

  it('puts an event drawer on the row and leaves the door time on the line', () => {
    expect(panel).toContain('voice="event"');
    expect(panel).toContain('events-row-menu-col');
    expect(panel).not.toContain('market-listing-meta-right');
    expect(panel).toContain('eventRowWhen');
    expect(panel).toContain('DiscoveryPartyStack');
    expect(panel).toContain('accountId={item.creatorId}');
  });
});
