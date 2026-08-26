export type ProtocolDaoCouncilRole = 'guardians' | 'council';

export type ProtocolDaoProposerFlags = {
  governance: boolean;
  treasury: boolean;
};

export type ProtocolDaoMemberships = {
  governance: ProtocolDaoCouncilRole | null;
  treasury: ProtocolDaoCouncilRole | null;
  proposer: ProtocolDaoProposerFlags;
};

export const EMPTY_PROTOCOL_DAO_PROPOSER_FLAGS: ProtocolDaoProposerFlags = {
  governance: false,
  treasury: false,
};

export const EMPTY_PROTOCOL_DAO_MEMBERSHIPS: ProtocolDaoMemberships = {
  governance: null,
  treasury: null,
  proposer: EMPTY_PROTOCOL_DAO_PROPOSER_FLAGS,
};
