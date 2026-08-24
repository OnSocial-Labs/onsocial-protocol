'use client';

import { ChoiceDrawerField, type ChoiceOption } from '@onsocial/ui';
import {
  isProtocolCreateMembershipKind,
  type ProtocolCreateKind,
} from '@/features/protocol/protocol-create';

export function ProtocolCreateRoleRow({
  kind,
  roleId,
  roles,
  pending,
  zIndex,
  onChangeRole,
  onChangeKind,
}: {
  kind: ProtocolCreateKind;
  roleId: string;
  roles: string[];
  pending: boolean;
  zIndex: number;
  onChangeRole: (roleId: string) => void;
  onChangeKind?: () => void;
}) {
  if (!isProtocolCreateMembershipKind(kind)) return null;

  if (roles.length === 0) {
    return <p className="protocol-compose-note">No roles available.</p>;
  }

  return (
    <div className="protocol-create-role-row">
      <div className="guild-field protocol-create-role-field">
        <ChoiceDrawerField
          label="Role"
          value={roleId}
          options={roles.map(
            (role): ChoiceOption<string> => ({
              value: role,
              label: role,
            })
          )}
          onChange={onChangeRole}
          disabled={pending}
          zIndex={zIndex}
        />
      </div>
      {onChangeKind ? (
        <button
          type="button"
          className="protocol-tool is-ghost protocol-create-change-type"
          onClick={onChangeKind}
          disabled={pending}
        >
          Change type
        </button>
      ) : null}
    </div>
  );
}
