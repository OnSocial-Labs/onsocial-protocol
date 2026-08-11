/** Shared Delete-drop confirm copy for Drops ⋮ / Drop page Manage. */
export function dropDeleteConfirmCopy(input: { title?: string | null }): {
  title: string;
  body: string;
  confirmLabel: string;
} {
  const name = input.title?.trim() || 'this drop';
  return {
    title: `Delete ${name}?`,
    body: 'This removes the drop if nothing was minted. You can’t undo it.',
    confirmLabel: 'Delete drop',
  };
}
