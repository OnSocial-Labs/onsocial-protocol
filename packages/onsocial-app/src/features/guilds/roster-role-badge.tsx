/** Role chip on a member name — Owner, Moderator, Creator. */
export function RosterRoleBadge({
  label,
  pending = false,
}: {
  label: string;
  pending?: boolean;
}) {
  return (
    <span
      className={`os-surface-row-badge guild-member-role-badge${
        pending ? ' guild-member-role-badge--pending' : ''
      }`}
    >
      {label}
    </span>
  );
}
