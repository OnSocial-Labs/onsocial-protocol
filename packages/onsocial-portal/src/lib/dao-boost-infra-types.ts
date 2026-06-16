export interface DaoBoostInfraContext {
  contractId: string;
  infraPoolYocto: string;
  ownerId: string | null;
  infraWithdrawAuthority: string | null;
  treasuryDaoAccountId: string;
  defaultReceiverId: string;
  canWithdrawBoostInfra: boolean;
  canSetBoostInfraAuthority: boolean;
}
