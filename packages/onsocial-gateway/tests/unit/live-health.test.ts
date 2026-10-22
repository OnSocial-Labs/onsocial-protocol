import { describe, expect, it } from 'vitest';
import {
  INDEXER_AT_TIP_LAG,
  deriveIndexerLiveStatus,
  deriveRpcLiveStatus,
  parseHasuraCursorBlock,
  parseStatusHead,
} from '../../src/services/live-health.js';

describe('live health', () => {
  it('reads the indexer cursor from a Hasura SQL result', () => {
    expect(
      parseHasuraCursorBlock({
        result: [['block_num'], ['274214046']],
      })
    ).toBe(274214046);
    expect(parseHasuraCursorBlock({ result: [['block_num']] })).toBeNull();
  });

  it('reads the chain head from a NEAR status result', () => {
    expect(
      parseStatusHead({ sync_info: { latest_block_height: 274214050 } })
    ).toBe(274214050);
  });

  it('treats a small lag as at tip and a real gap as catching up', () => {
    expect(
      deriveIndexerLiveStatus({ cursor: 100, head: 100 + INDEXER_AT_TIP_LAG })
    ).toMatchObject({ status: 'up', lagBlocks: INDEXER_AT_TIP_LAG });
    expect(deriveIndexerLiveStatus({ cursor: 100, head: 140 })).toMatchObject({
      status: 'degraded',
      lagBlocks: 40,
    });
    expect(deriveIndexerLiveStatus({ cursor: null, head: 140 }).status).toBe(
      'down'
    );
  });

  it('marks RPC up only when the primary answered', () => {
    expect(deriveRpcLiveStatus(true, true)).toBe('up');
    expect(deriveRpcLiveStatus(true, false)).toBe('degraded');
    expect(deriveRpcLiveStatus(false, true)).toBe('down');
  });
});
