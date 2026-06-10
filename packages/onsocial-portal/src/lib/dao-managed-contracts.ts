import 'server-only';

import {
  BOOST_CONTRACT,
  REWARDS_CONTRACT,
  SCARCES_CONTRACT,
  SOCIAL_SPEND_CONTRACT,
  TOKEN_CONTRACT,
  viewContractAt,
} from '@/lib/near-rpc';

export interface DaoManagedContract {
  contractId: string;
  label: string;
  transferMethod: string;
  transferArgField: 'new_owner' | 'owner_id';
  gas: number;
  deposit: string;
}

interface DaoManagedContractDefinition {
  contractId: string;
  label: string;
  ownerViewMethod: string;
  ownerViewArgs?: Record<string, unknown>;
  /** When null, the view method returns an account id string directly. */
  ownerField: 'owner_id' | 'owner' | null;
  transferMethod: string;
  transferArgField: 'new_owner' | 'owner_id';
  gas: number;
  deposit: string;
}

const DAO_MANAGED_CONTRACT_DEFINITIONS: readonly DaoManagedContractDefinition[] =
  [
    {
      contractId: REWARDS_CONTRACT,
      label: 'Rewards',
      ownerViewMethod: 'get_contract_info',
      ownerField: 'owner_id',
      transferMethod: 'transfer_ownership',
      transferArgField: 'new_owner',
      gas: 300_000_000_000_000,
      deposit: '0',
    },
    {
      contractId: BOOST_CONTRACT,
      label: 'Boost',
      ownerViewMethod: 'get_contract_stats',
      ownerField: 'owner_id',
      transferMethod: 'set_owner',
      transferArgField: 'new_owner',
      gas: 100_000_000_000_000,
      deposit: '1',
    },
    {
      contractId: SCARCES_CONTRACT,
      label: 'Scarces',
      ownerViewMethod: 'get_contract_info',
      ownerField: 'owner',
      transferMethod: 'transfer_ownership',
      transferArgField: 'new_owner',
      gas: 100_000_000_000_000,
      deposit: '1',
    },
    {
      contractId: TOKEN_CONTRACT,
      label: 'Token',
      ownerViewMethod: 'get_owner',
      ownerField: null,
      transferMethod: 'set_owner',
      transferArgField: 'new_owner',
      gas: 100_000_000_000_000,
      deposit: '0',
    },
    {
      contractId: SOCIAL_SPEND_CONTRACT,
      label: 'Social spend',
      ownerViewMethod: 'get_contract_info',
      ownerField: 'owner_id',
      transferMethod: 'set_owner',
      transferArgField: 'owner_id',
      gas: 100_000_000_000_000,
      deposit: '1',
    },
  ];

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

function normalizeAccountId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return ACCOUNT_ID_PATTERN.test(normalized) ? normalized : null;
}

async function readContractOwner(
  definition: DaoManagedContractDefinition
): Promise<string | null> {
  try {
    const result = await viewContractAt<unknown>(
      definition.contractId,
      definition.ownerViewMethod,
      definition.ownerViewArgs ?? {}
    );

    if (definition.ownerField === null) {
      return normalizeAccountId(result);
    }

    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      return null;
    }

    return normalizeAccountId(
      (result as Record<string, unknown>)[definition.ownerField]
    );
  } catch {
    return null;
  }
}

function toManagedContract(
  definition: DaoManagedContractDefinition
): DaoManagedContract {
  return {
    contractId: definition.contractId,
    label: definition.label,
    transferMethod: definition.transferMethod,
    transferArgField: definition.transferArgField,
    gas: definition.gas,
    deposit: definition.deposit,
  };
}

export async function loadDaoManagedContracts(
  daoAccountId: string
): Promise<DaoManagedContract[]> {
  const normalizedDaoAccountId = daoAccountId.trim().toLowerCase();
  if (!ACCOUNT_ID_PATTERN.test(normalizedDaoAccountId)) {
    throw new Error('Invalid daoAccountId');
  }

  const matches = await Promise.all(
    DAO_MANAGED_CONTRACT_DEFINITIONS.map(async (definition) => {
      const ownerId = await readContractOwner(definition);
      if (ownerId !== normalizedDaoAccountId) {
        return null;
      }

      return toManagedContract(definition);
    })
  );

  return matches
    .filter((contract): contract is DaoManagedContract => contract != null)
    .sort((left, right) => left.label.localeCompare(right.label));
}
