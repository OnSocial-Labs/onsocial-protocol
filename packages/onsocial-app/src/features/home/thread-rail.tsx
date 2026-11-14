/**
 * Avatar-column stroke. The column is the face width; the line is centred
 * on that column (`left: 50%`), so feed, Post page, and composer share one
 * centre without a border offset.
 */
export function ThreadRail({
  up = false,
  down = false,
  through = false,
  bridge = false,
}: {
  up?: boolean;
  down?: boolean;
  /** Full column, used where chrome sits between two connected posts. */
  through?: boolean;
  /** Extends the down segment into the next row. */
  bridge?: boolean;
}) {
  if (!up && !down && !through) return null;
  const className = [
    'thread-rail-col',
    up ? 'is-up' : '',
    down ? 'is-down' : '',
    through ? 'is-through' : '',
    bridge ? 'is-bridge' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return <span className={className} aria-hidden />;
}
