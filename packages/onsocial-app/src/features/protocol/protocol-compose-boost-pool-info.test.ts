import { describe, expect, it } from 'vitest';
import {
  PROTOCOL_COMPOSE_BOOST_POOL_META,
  protocolComposeBoostPoolInfo,
} from '@/features/protocol/protocol-compose-boost-pool-info';

describe('protocolComposeBoostPoolInfo', () => {
  it('uses compact meta and drawer copy', () => {
    expect(PROTOCOL_COMPOSE_BOOST_POOL_META).toBe('60/40');
    expect(protocolComposeBoostPoolInfo()).toMatchObject({
      title: 'Boost pool',
    });
    expect(protocolComposeBoostPoolInfo().detail).toMatch(/infra/i);
    expect(protocolComposeBoostPoolInfo().detail).toMatch(/lock rewards/i);
    expect(protocolComposeBoostPoolInfo().summary).not.toMatch(/protocol fee/i);
  });
});
