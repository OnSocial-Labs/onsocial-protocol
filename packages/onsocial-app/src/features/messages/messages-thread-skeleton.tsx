export function MessagesThreadSkeleton({ count = 4 }: { count?: number }) {
  return (
    <ul
      className="messages-bubble-list messages-bubble-list--skeleton"
      aria-busy="true"
      aria-label="Loading messages"
    >
      {Array.from({ length: count }, (_, index) => (
        <li
          key={index}
          className={`messages-bubble messages-bubble--skeleton${
            index % 2 === 1 ? ' is-mine' : ''
          }`}
          aria-hidden
        >
          <span className="messages-skeleton-line messages-skeleton-line--wide" />
          <span className="messages-skeleton-line messages-skeleton-line--short" />
        </li>
      ))}
    </ul>
  );
}

export function MessagesThreadAppendSkeleton({ count = 2 }: { count?: number }) {
  return (
    <ul
      className="messages-bubble-list messages-bubble-list--skeleton messages-bubble-list--append-skeleton"
      data-messages-append-skeleton
      aria-hidden
    >
      {Array.from({ length: count }, (_, index) => (
        <li
          key={index}
          className={`messages-bubble messages-bubble--skeleton${
            index % 2 === 1 ? ' is-mine' : ''
          }`}
        >
          <span className="messages-skeleton-line messages-skeleton-line--wide" />
          <span className="messages-skeleton-line messages-skeleton-line--short" />
        </li>
      ))}
    </ul>
  );
}
