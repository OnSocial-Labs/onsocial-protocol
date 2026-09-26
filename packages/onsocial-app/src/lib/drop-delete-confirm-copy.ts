/** Shared delete confirm for a drop or event ⋮ / Manage. */
export function dropDeleteConfirmCopy(input: {
  title?: string | null;
  noun?: 'drop' | 'event';
}): {
  title: string;
  body: string;
  confirmLabel: string;
} {
  const event = input.noun === 'event';
  const name = input.title?.trim() || (event ? 'this event' : 'this drop');
  return {
    title: `Delete ${name}?`,
    body: event
      ? 'This removes the event if no tickets were minted. You can’t undo it.'
      : 'This removes the drop if nothing was minted. You can’t undo it.',
    confirmLabel: event ? 'Delete event' : 'Delete drop',
  };
}
