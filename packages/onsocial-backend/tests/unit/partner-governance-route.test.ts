import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'crypto';
import nacl from 'tweetnacl';

const mockQuery = vi.fn();
const mockBuildRegisterAppGovernanceProposal = vi.fn();
const mockIsRewardsAppRegistered = vi.fn();
const mockFetch = vi.fn();

vi.stubGlobal('fetch', mockFetch);

vi.mock('../../src/db/index.js', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

vi.mock('../../src/services/governance-proposals.js', () => ({
  PARTNER_AUDIENCE_BANDS: ['<1k', '1k-10k', '10k-50k', '50k+'],
  getPartnerGovernanceParamsForAudienceBand: (audienceBand: string) => ({
    rewardPerAction: '0.1',
    dailyCap: '1',
    totalBudget:
      audienceBand === '<1k'
        ? '50000'
        : audienceBand === '1k-10k'
          ? '250000'
          : audienceBand === '50k+'
            ? '1500000'
            : '750000',
    dailyBudget:
      audienceBand === '<1k'
        ? '500'
        : audienceBand === '1k-10k'
          ? '2500'
          : audienceBand === '50k+'
            ? '15000'
            : '7500',
  }),
  buildRegisterAppGovernanceProposal: (...args: unknown[]) =>
    mockBuildRegisterAppGovernanceProposal(...args),
  isRewardsAppRegistered: (...args: unknown[]) =>
    mockIsRewardsAppRegistered(...args),
}));

vi.mock('../../src/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  },
}));

import express from 'express';
import request from 'supertest';

const { default: partnerGovernanceRouter } = await import(
  '../../src/routes/partner-governance.js'
);
const { default: governanceRouter } = await import(
  '../../src/routes/governance.js'
);

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/v1/governance', governanceRouter);
  app.use('/v1/partners', partnerGovernanceRouter);
  return app;
}

function makeRows(rows: Record<string, unknown>[]) {
  return { rows };
}

function mockRpcViewResult(value: unknown) {
  return {
    ok: true,
    json: async () => ({
      result: {
        result: Array.from(Buffer.from(JSON.stringify(value))),
      },
    }),
  };
}

function encodeU32(value: number): Uint8Array {
  const buffer = new ArrayBuffer(4);
  new DataView(buffer).setUint32(0, value, true);
  return new Uint8Array(buffer);
}

function encodeString(value: string): Uint8Array {
  const bytes = new TextEncoder().encode(value);
  const encodedLength = encodeU32(bytes.length);
  const output = new Uint8Array(encodedLength.length + bytes.length);
  output.set(encodedLength);
  output.set(bytes, encodedLength.length);
  return output;
}

function encodeOptionalString(value: string | null): Uint8Array {
  if (value == null) {
    return new Uint8Array([0]);
  }

  const encodedValue = encodeString(value);
  const output = new Uint8Array(1 + encodedValue.length);
  output[0] = 1;
  output.set(encodedValue, 1);
  return output;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }

  return output;
}

function serializeNep413Payload(input: {
  message: string;
  nonce: Uint8Array;
  recipient: string;
  callbackUrl: string | null;
}): Uint8Array {
  const prefix = encodeU32(2 ** 31 + 413);
  const payload = concatBytes([
    encodeString(input.message),
    input.nonce,
    encodeString(input.recipient),
    encodeOptionalString(input.callbackUrl),
  ]);

  return createHash('sha256')
    .update(Buffer.from(concatBytes([prefix, payload])))
    .digest();
}

const DRAFT_PROPOSAL = {
  metadata: {
    proposal_id: null,
    status: 'draft',
    description: 'Register test app',
    dao_account: 'governance.onsocial.testnet',
    tx_hash: null,
    submitted_at: null,
  },
  payload: {
    proposal: {
      description: 'Register test app',
      kind: {
        FunctionCall: {
          receiver_id: 'rewards.onsocial.testnet',
          actions: [],
        },
      },
    },
  },
};

beforeEach(() => {
  mockQuery.mockReset();
  mockBuildRegisterAppGovernanceProposal.mockReset();
  mockIsRewardsAppRegistered.mockReset();
  mockQuery.mockResolvedValue(makeRows([]));
  mockBuildRegisterAppGovernanceProposal.mockReturnValue(DRAFT_PROPOSAL);
  mockIsRewardsAppRegistered.mockResolvedValue(false);
  mockFetch.mockReset();
});

describe('POST /v1/partners/apply', () => {
  it('rejects missing label', async () => {
    const res = await request(buildApp()).post('/v1/partners/apply').send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/label is required/);
  });

  it('creates a pending application and auto-generates the app id', async () => {
    mockQuery.mockResolvedValueOnce(makeRows([]));
    mockQuery.mockResolvedValueOnce(makeRows([]));

    const res = await request(buildApp()).post('/v1/partners/apply').send({
      label: 'Cool Dapp 2026',
      description: 'A Telegram bot for community engagement.',
      audience_band: '1k-10k',
      wallet_id: 'alice.testnet',
      website_url: 'https://example.com',
      telegram_handle: '@onsocial',
      x_handle: 'onsocial_app',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.app_id).toBe('cool_dapp_2026');
    expect(res.body.status).toBe('ready_for_governance');
  });

  it('creates a governance draft with the default partner terms', async () => {
    mockQuery.mockResolvedValueOnce(makeRows([]));
    mockQuery.mockResolvedValueOnce(makeRows([]));

    const res = await request(buildApp()).post('/v1/partners/apply').send({
      label: 'My Awesome Bot',
      wallet_id: 'alice.testnet',
      description: 'Partner app for community growth rewards.',
      audience_band: '10k-50k',
      website_url: 'https://example.com',
    });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready_for_governance');
    expect(mockBuildRegisterAppGovernanceProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 'my_awesome_bot',
        label: 'My Awesome Bot',
        params: {
          rewardPerAction: '0.1',
          dailyCap: '1',
          totalBudget: '750000',
          dailyBudget: '7500',
        },
        metadata: expect.objectContaining({
          audienceBand: '10k-50k',
          description: 'Partner app for community growth rewards.',
          websiteUrl: 'https://example.com/',
          telegramHandle: '',
          xHandle: '',
        }),
      })
    );
    expect(res.body.governance_proposal).toEqual(
      expect.objectContaining({
        status: 'draft',
        dao_account: 'governance.onsocial.testnet',
        payload: DRAFT_PROPOSAL.payload,
      })
    );
  });

  it('normalizes shorthand website, Telegram, and X inputs', async () => {
    mockQuery.mockResolvedValueOnce(makeRows([]));
    mockQuery.mockResolvedValueOnce(makeRows([]));

    const res = await request(buildApp()).post('/v1/partners/apply').send({
      label: 'Canonical App',
      wallet_id: 'alice.testnet',
      description: 'Partner app for community growth rewards.',
      audience_band: '1k-10k',
      website_url: 'example.com',
      telegram_handle: 't.me/onsocialgroup',
      x_handle: 'x.com/onsocial',
    });

    expect(res.status).toBe(200);
    expect(mockBuildRegisterAppGovernanceProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          websiteUrl: 'https://example.com/',
          telegramHandle: '@onsocialgroup',
          xHandle: '@onsocial',
        }),
      })
    );
  });

  it('accepts clean project names and descriptions with basic punctuation', async () => {
    mockQuery.mockResolvedValueOnce(makeRows([]));
    mockQuery.mockResolvedValueOnce(makeRows([]));

    const res = await request(buildApp()).post('/v1/partners/apply').send({
      label: 'MENA / GCC Builders & Creators',
      wallet_id: 'alice.testnet',
      description:
        'Builders, creators, and community leads: events, updates, and support.',
      audience_band: '1k-10k',
      website_url: 'https://example.com',
    });

    expect(res.status).toBe(200);
    expect(mockBuildRegisterAppGovernanceProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'MENA / GCC Builders & Creators',
        metadata: expect.objectContaining({
          description:
            'Builders, creators, and community leads: events, updates, and support.',
        }),
      })
    );
  });

  it('rejects project names with unsupported characters', async () => {
    const res = await request(buildApp()).post('/v1/partners/apply').send({
      label: 'fvkn;dfnvdfv',
      description: 'Partner app for community growth rewards.',
      audience_band: '1k-10k',
      wallet_id: 'alice.testnet',
      website_url: 'https://example.com',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(
      /label must use letters, numbers, spaces, and simple punctuation only/
    );
  });

  it('rejects descriptions with unsupported characters', async () => {
    const res = await request(buildApp()).post('/v1/partners/apply').send({
      label: 'Clean Name',
      description: 'Community updates <script> with a strange payload.',
      audience_band: '1k-10k',
      wallet_id: 'alice.testnet',
      website_url: 'https://example.com',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(
      /description must use letters, numbers, spaces, and basic punctuation only/
    );
  });

  it('reuses a reopened application for the same wallet', async () => {
    mockQuery.mockResolvedValueOnce(
      makeRows([{ id: 1, status: 'reopened', wallet_id: 'alice.testnet' }])
    );
    mockQuery.mockResolvedValueOnce(makeRows([]));

    const res = await request(buildApp()).post('/v1/partners/apply').send({
      label: 'Test App',
      app_id: 'test_app',
      description: 'Partner app for community growth rewards.',
      audience_band: '<1k',
      wallet_id: 'alice.testnet',
      telegram_handle: '@testapp',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.app_id).toBe('test_app');
    expect(res.body.status).toBe('ready_for_governance');
  });

  it('rejects applications without any public channel', async () => {
    const res = await request(buildApp()).post('/v1/partners/apply').send({
      label: 'No Public Channel',
      description: 'Partner app for community growth rewards.',
      audience_band: '1k-10k',
      wallet_id: 'alice.testnet',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(
      /At least one of website_url, telegram_handle, or x_handle is required/
    );
  });

  it('rejects applications without a valid audience band', async () => {
    const res = await request(buildApp()).post('/v1/partners/apply').send({
      label: 'Unknown Audience',
      description: 'Partner app for community growth rewards.',
      audience_band: '100k+',
      wallet_id: 'alice.testnet',
      website_url: 'https://example.com',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/audience_band must be one of/);
  });

  it('rejects websites longer than 255 characters', async () => {
    const longDomain = `${'a'.repeat(244)}.com`;

    const res = await request(buildApp()).post('/v1/partners/apply').send({
      label: 'Long Website App',
      description: 'Partner app for community growth rewards.',
      audience_band: '1k-10k',
      wallet_id: 'alice.testnet',
      website_url: longDomain,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(
      /website_url must be 255 characters or fewer/
    );
  });

  it('rejects websites without a hostname before the suffix', async () => {
    const res = await request(buildApp()).post('/v1/partners/apply').send({
      label: 'Bare Suffix App',
      description: 'Partner app for community growth rewards.',
      audience_band: '1k-10k',
      wallet_id: 'alice.testnet',
      website_url: '.com',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(
      /website_url must include a domain like example.com/
    );
  });
});

describe('GET /v1/governance/feed scoped results', () => {
  it('returns the public governance feed with parsed payloads', async () => {
    mockQuery.mockResolvedValueOnce(
      makeRows([
        {
          app_id: 'test_app',
          label: 'Test App',
          status: 'ready_for_governance',
          wallet_id: 'alice.testnet',
          description: 'Partner app for community growth rewards.',
          created_at: '2026-01-01',
          governance_proposal_id: null,
          governance_proposal_status: 'draft',
          governance_proposal_description: 'Register test app',
          governance_proposal_dao: 'governance.onsocial.testnet',
          governance_proposal_payload: JSON.stringify(DRAFT_PROPOSAL.payload),
          governance_proposal_tx_hash: null,
          governance_proposal_submitted_at: null,
        },
      ])
    );

    const res = await request(buildApp()).get(
      '/v1/governance/feed?scope=partners'
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.applications).toHaveLength(1);
    expect(res.body.applications[0].governance_proposal).toEqual(
      expect.objectContaining({
        status: 'draft',
        payload: DRAFT_PROPOSAL.payload,
      })
    );
  });

  it('keeps rejected governance proposals visible in the public feed', async () => {
    mockQuery.mockResolvedValueOnce(
      makeRows([
        {
          app_id: 'test_app',
          label: 'Test App',
          status: 'rejected',
          wallet_id: 'alice.testnet',
          description: 'Partner app for community growth rewards.',
          created_at: '2026-01-01',
          governance_proposal_id: 21,
          governance_proposal_status: 'rejected',
          governance_proposal_description: 'Register test app',
          governance_proposal_dao: 'governance.onsocial.testnet',
          governance_proposal_payload: JSON.stringify(DRAFT_PROPOSAL.payload),
          governance_proposal_tx_hash: 'tx-hash-123',
          governance_proposal_submitted_at: '2026-03-23T00:00:00.000Z',
        },
      ])
    );

    const res = await request(buildApp()).get(
      '/v1/governance/feed?scope=partners'
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.applications).toHaveLength(1);
    expect(res.body.applications[0]).toEqual(
      expect.objectContaining({
        app_id: 'test_app',
        status: 'rejected',
        governance_proposal: expect.objectContaining({
          proposal_id: 21,
          status: 'rejected',
        }),
      })
    );
  });

  it('keeps removed governance proposals visible in the public feed', async () => {
    mockQuery.mockResolvedValueOnce(
      makeRows([
        {
          app_id: 'test_app',
          label: 'Test App',
          status: 'rejected',
          wallet_id: 'alice.testnet',
          description: 'Partner app for community growth rewards.',
          created_at: '2026-01-01',
          governance_proposal_id: 21,
          governance_proposal_status: 'removed',
          governance_proposal_description: 'Register test app',
          governance_proposal_dao: 'governance.onsocial.testnet',
          governance_proposal_payload: JSON.stringify(DRAFT_PROPOSAL.payload),
          governance_proposal_tx_hash: 'tx-hash-123',
          governance_proposal_submitted_at: '2026-03-23T00:00:00.000Z',
        },
      ])
    );

    const res = await request(buildApp()).get(
      '/v1/governance/feed?scope=partners'
    );

    expect(res.status).toBe(200);
    expect(res.body.applications).toHaveLength(1);
    expect(res.body.applications[0]).toEqual(
      expect.objectContaining({
        status: 'rejected',
        governance_proposal: expect.objectContaining({
          proposal_id: 21,
          status: 'removed',
        }),
      })
    );
  });

  it('keeps expired governance proposals visible in the public feed', async () => {
    mockQuery.mockResolvedValueOnce(
      makeRows([
        {
          app_id: 'test_app',
          label: 'Test App',
          status: 'reopened',
          wallet_id: 'alice.testnet',
          description: 'Partner app for community growth rewards.',
          created_at: '2026-01-01',
          governance_proposal_id: 22,
          governance_proposal_status: 'expired',
          governance_proposal_description: 'Register test app',
          governance_proposal_dao: 'governance.onsocial.testnet',
          governance_proposal_payload: JSON.stringify(DRAFT_PROPOSAL.payload),
          governance_proposal_tx_hash: 'tx-hash-456',
          governance_proposal_submitted_at: '2026-03-24T00:00:00.000Z',
        },
      ])
    );

    const res = await request(buildApp()).get(
      '/v1/governance/feed?scope=partners'
    );

    expect(res.status).toBe(200);
    expect(res.body.applications).toHaveLength(1);
    expect(res.body.applications[0]).toEqual(
      expect.objectContaining({
        status: 'reopened',
        governance_proposal: expect.objectContaining({
          proposal_id: 22,
          status: 'expired',
        }),
      })
    );
  });

  it('auto-approves executed proposals when the app is already on-chain', async () => {
    mockQuery.mockResolvedValueOnce(
      makeRows([
        {
          app_id: 'test_app',
          label: 'Test App',
          status: 'proposal_submitted',
          api_key: null,
          governance_proposal_status: 'submitted',
        },
      ])
    );
    mockQuery.mockResolvedValueOnce(makeRows([]));
    mockIsRewardsAppRegistered.mockResolvedValueOnce(true);

    const res = await request(buildApp()).get(
      '/v1/governance/feed?scope=partners'
    );

    expect(res.status).toBe(200);
    expect(res.body.applications[0].status).toBe('approved');
    expect(res.body.applications[0].api_key).toBeUndefined();
    expect(mockQuery.mock.calls[1]?.[0]).toMatch(/UPDATE partner_keys/);
  });

  it('adds allowlisted protocol proposals to the public governance feed', async () => {
    mockQuery.mockResolvedValueOnce(makeRows([]));
    mockFetch
      .mockResolvedValueOnce(mockRpcViewResult(25))
      .mockResolvedValueOnce(
        mockRpcViewResult([
          {
            id: 25,
            proposer: 'voter2.onsocial.testnet',
            description: 'Upgrade boost contract to cleaned 1.0.0 artifact',
            kind: {
              FunctionCall: {
                receiver_id: 'boost.onsocial.testnet',
                actions: [
                  {
                    method_name: 'update_contract_from_hash',
                  },
                ],
              },
            },
            status: 'Approved',
            submission_time: '1773316924632618708',
          },
        ])
      );

    const res = await request(buildApp()).get(
      '/v1/governance/feed?scope=protocol'
    );

    expect(res.status).toBe(200);
    expect(res.body.applications).toHaveLength(1);
    expect(res.body.applications[0]).toEqual(
      expect.objectContaining({
        governance_scope: 'protocol',
        protocol_kind: 'upgrade',
        protocol_subject: 'Boost contract',
        protocol_target_account: 'boost.onsocial.testnet',
        protocol_target_method: 'update_contract_from_hash',
        governance_proposal: expect.objectContaining({
          proposal_id: 25,
          proposer: 'voter2.onsocial.testnet',
          status: 'Approved',
        }),
      })
    );
  });

  it('classifies rewards register_app proposals as partner governance, not protocol governance', async () => {
    mockQuery.mockResolvedValueOnce(makeRows([]));
    mockFetch
      .mockResolvedValueOnce(mockRpcViewResult(27))
      .mockResolvedValueOnce(
        mockRpcViewResult([
          {
            id: 27,
            proposer: 'guardian.onsocial.testnet',
            description:
              'Register community app Partner Alpha (partner_alpha) on rewards.onsocial.testnet.',
            kind: {
              FunctionCall: {
                receiver_id: 'rewards.onsocial.testnet',
                actions: [
                  {
                    method_name: 'register_app',
                    args: Buffer.from(
                      JSON.stringify({
                        config: {
                          app_id: 'partner_alpha',
                          label: 'Partner Alpha',
                        },
                      })
                    ).toString('base64'),
                  },
                ],
              },
            },
            status: 'InProgress',
            submission_time: '1773316924632618708',
          },
        ])
      );

    const partnersRes = await request(buildApp()).get(
      '/v1/governance/feed?scope=partners'
    );

    expect(partnersRes.status).toBe(200);
    expect(partnersRes.body.applications).toHaveLength(1);
    expect(partnersRes.body.applications[0]).toEqual(
      expect.objectContaining({
        app_id: 'partner_alpha',
        label: 'Partner Alpha',
        governance_scope: 'partners',
        governance_proposal: expect.objectContaining({
          proposal_id: 27,
          proposer: 'guardian.onsocial.testnet',
          status: 'InProgress',
        }),
      })
    );

    mockQuery.mockResolvedValueOnce(makeRows([]));
    mockFetch
      .mockResolvedValueOnce(mockRpcViewResult(27))
      .mockResolvedValueOnce(
        mockRpcViewResult([
          {
            id: 27,
            proposer: 'guardian.onsocial.testnet',
            description:
              'Register community app Partner Alpha (partner_alpha) on rewards.onsocial.testnet.',
            kind: {
              FunctionCall: {
                receiver_id: 'rewards.onsocial.testnet',
                actions: [
                  {
                    method_name: 'register_app',
                    args: Buffer.from(
                      JSON.stringify({
                        config: {
                          app_id: 'partner_alpha',
                          label: 'Partner Alpha',
                        },
                      })
                    ).toString('base64'),
                  },
                ],
              },
            },
            status: 'InProgress',
            submission_time: '1773316924632618708',
          },
        ])
      );

    const protocolRes = await request(buildApp()).get(
      '/v1/governance/feed?scope=protocol'
    );

    expect(protocolRes.status).toBe(200);
    expect(protocolRes.body.applications).toHaveLength(0);
  });

  it('excludes staking governance from the public governance feed', async () => {
    mockQuery.mockResolvedValueOnce(makeRows([]));
    mockFetch
      .mockResolvedValueOnce(mockRpcViewResult(26))
      .mockResolvedValueOnce(
        mockRpcViewResult([
          {
            id: 0,
            proposer: 'greenghost.onsocial.testnet',
            description: 'Set governance staking contract',
            kind: {
              SetStakingContract: {
                staking_id: 'staking-governance.onsocial.testnet',
              },
            },
            status: 'Approved',
            submission_time: '1773316571093161525',
          },
          {
            id: 25,
            proposer: 'voter2.onsocial.testnet',
            description: 'Upgrade boost contract to cleaned 1.0.0 artifact',
            kind: {
              FunctionCall: {
                receiver_id: 'boost.onsocial.testnet',
                actions: [
                  {
                    method_name: 'update_contract_from_hash',
                  },
                ],
              },
            },
            status: 'Approved',
            submission_time: '1773316924632618708',
          },
        ])
      );

    const res = await request(buildApp()).get(
      '/v1/governance/feed?scope=protocol'
    );

    expect(res.status).toBe(200);
    expect(res.body.applications).toHaveLength(1);
    expect(res.body.applications[0].protocol_target_account).toBe(
      'boost.onsocial.testnet'
    );
  });
});

describe('GET /v1/governance/feed', () => {
  it('returns the mixed governance feed by default', async () => {
    mockQuery.mockResolvedValueOnce(
      makeRows([
        {
          app_id: 'test_app',
          label: 'Test App',
          status: 'ready_for_governance',
          wallet_id: 'alice.testnet',
          description: 'Partner app for community growth rewards.',
          created_at: '2026-01-01',
          governance_proposal_id: null,
          governance_proposal_status: 'draft',
          governance_proposal_description: 'Register test app',
          governance_proposal_dao: 'governance.onsocial.testnet',
          governance_proposal_payload: JSON.stringify(DRAFT_PROPOSAL.payload),
          governance_proposal_tx_hash: null,
          governance_proposal_submitted_at: null,
        },
      ])
    );
    mockFetch
      .mockResolvedValueOnce(mockRpcViewResult(25))
      .mockResolvedValueOnce(
        mockRpcViewResult([
          {
            id: 25,
            proposer: 'voter2.onsocial.testnet',
            description: 'Upgrade boost contract to cleaned 1.0.0 artifact',
            kind: {
              FunctionCall: {
                receiver_id: 'boost.onsocial.testnet',
                actions: [{ method_name: 'update_contract_from_hash' }],
              },
            },
            status: 'Approved',
            submission_time: '1773316924632618708',
          },
        ])
      );

    const res = await request(buildApp()).get('/v1/governance/feed');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.scope).toBe('all');
    expect(res.body.applications).toHaveLength(2);
  });

  it('supports protocol-only scope', async () => {
    mockFetch
      .mockResolvedValueOnce(mockRpcViewResult(25))
      .mockResolvedValueOnce(
        mockRpcViewResult([
          {
            id: 25,
            proposer: 'voter2.onsocial.testnet',
            description: 'Upgrade boost contract to cleaned 1.0.0 artifact',
            kind: {
              FunctionCall: {
                receiver_id: 'boost.onsocial.testnet',
                actions: [{ method_name: 'update_contract_from_hash' }],
              },
            },
            status: 'Approved',
            submission_time: '1773316924632618708',
          },
        ])
      );

    const res = await request(buildApp()).get(
      '/v1/governance/feed?scope=protocol'
    );

    expect(res.status).toBe(200);
    expect(res.body.scope).toBe('protocol');
    expect(res.body.applications).toHaveLength(1);
    expect(res.body.applications[0].governance_scope).toBe('protocol');
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('GET /v1/partners/status/:wallet', () => {
  it('returns none for unknown wallets', async () => {
    mockQuery.mockResolvedValueOnce(makeRows([]));

    const res = await request(buildApp()).get(
      '/v1/partners/status/unknown.testnet'
    );

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('none');
  });

  it('returns approved apps without exposing their api key', async () => {
    mockQuery.mockResolvedValueOnce(
      makeRows([
        {
          app_id: 'test_app',
          label: 'Test App',
          status: 'approved',
          api_key: 'os_live_abc123',
          created_at: '2026-01-01',
          governance_proposal_status: 'executed',
        },
      ])
    );

    const res = await request(buildApp()).get(
      '/v1/partners/status/alice.testnet'
    );

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('approved');
    expect(res.body.api_key).toBeUndefined();
  });

  it('auto-activates proposal-submitted apps after execution', async () => {
    mockQuery.mockResolvedValueOnce(
      makeRows([
        {
          app_id: 'test_app',
          label: 'Test App',
          status: 'proposal_submitted',
          api_key: null,
          created_at: '2026-01-01',
          governance_proposal_id: 42,
          governance_proposal_status: 'submitted',
          governance_proposal_description: 'Register test app',
          governance_proposal_dao: 'governance.onsocial.testnet',
          governance_proposal_payload: JSON.stringify(DRAFT_PROPOSAL.payload),
          governance_proposal_tx_hash: 'tx-hash-123',
          governance_proposal_submitted_at: '2026-03-23T00:00:00.000Z',
        },
      ])
    );
    mockQuery.mockResolvedValueOnce(makeRows([]));
    mockIsRewardsAppRegistered.mockResolvedValueOnce(true);

    const res = await request(buildApp()).get(
      '/v1/partners/status/alice.testnet'
    );

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('approved');
    expect(res.body.api_key).toBeUndefined();
    expect(res.body.governance_proposal).toEqual(
      expect.objectContaining({
        proposal_id: 42,
        status: 'executed',
      })
    );
  });

  it('marks rejected DAO proposals as rejected in the partner flow', async () => {
    mockQuery.mockResolvedValueOnce(
      makeRows([
        {
          app_id: 'test_app',
          label: 'Test App',
          status: 'proposal_submitted',
          api_key: null,
          created_at: '2026-01-01',
          governance_proposal_id: 21,
          governance_proposal_status: 'submitted',
          governance_proposal_description: 'Register test app',
          governance_proposal_dao: 'governance.onsocial.testnet',
          governance_proposal_payload: JSON.stringify(DRAFT_PROPOSAL.payload),
          governance_proposal_tx_hash: 'tx-hash-123',
          governance_proposal_submitted_at: '2026-03-23T00:00:00.000Z',
        },
      ])
    );
    mockQuery.mockResolvedValueOnce(makeRows([]));
    mockFetch.mockResolvedValueOnce(mockRpcViewResult({ status: 'Rejected' }));

    const res = await request(buildApp()).get(
      '/v1/partners/status/alice.testnet'
    );

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('rejected');
    expect(res.body.governance_proposal).toEqual(
      expect.objectContaining({
        proposal_id: 21,
        status: 'rejected',
      })
    );
    expect(mockQuery.mock.calls[1]?.[0]).toMatch(/SET status = 'rejected'/);
  });

  it('returns expired DAO proposals to the apply flow', async () => {
    mockQuery.mockResolvedValueOnce(
      makeRows([
        {
          app_id: 'test_app',
          label: 'Test App',
          status: 'proposal_submitted',
          api_key: null,
          created_at: '2026-01-01',
          governance_proposal_id: 22,
          governance_proposal_status: 'submitted',
          governance_proposal_description: 'Register test app',
          governance_proposal_dao: 'governance.onsocial.testnet',
          governance_proposal_payload: JSON.stringify(DRAFT_PROPOSAL.payload),
          governance_proposal_tx_hash: 'tx-hash-456',
          governance_proposal_submitted_at: '2026-03-24T00:00:00.000Z',
        },
      ])
    );
    mockQuery.mockResolvedValueOnce(makeRows([]));
    mockFetch.mockResolvedValueOnce(mockRpcViewResult({ status: 'Expired' }));

    const res = await request(buildApp()).get(
      '/v1/partners/status/alice.testnet'
    );

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('none');
    expect(res.body.governance_proposal).toEqual(
      expect.objectContaining({
        proposal_id: 22,
        status: 'expired',
      })
    );
    expect(mockQuery.mock.calls[1]?.[0]).toMatch(/SET status = 'reopened'/);
  });

  it('maps reopened applications to none for the partner flow', async () => {
    mockQuery.mockResolvedValueOnce(
      makeRows([
        {
          app_id: 'test_app',
          label: 'Test App',
          status: 'reopened',
          api_key: null,
          created_at: '2026-01-01',
          description: 'Partner app for community growth rewards.',
          website_url: 'https://example.com/',
          telegram_handle: '@onsocial',
          x_handle: '@onsocial_app',
          governance_proposal_description:
            'Register test app\nAudience band: 10k-50k\nDescription: Partner app for community growth rewards.',
        },
      ])
    );

    const res = await request(buildApp()).get(
      '/v1/partners/status/alice.testnet'
    );

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('none');
    expect(res.body.api_key).toBeUndefined();
    expect(res.body.application_form).toEqual(
      expect.objectContaining({
        appId: 'test_app',
        label: 'Test App',
        description: 'Partner app for community growth rewards.',
        audienceBand: '10k-50k',
        websiteUrl: 'https://example.com/',
        telegramHandle: '@onsocial',
        xHandle: '@onsocial_app',
      })
    );
  });
});

describe('POST /v1/partners/proposal-submitted/:appId', () => {
  it('returns a governance-ready application to the apply form', async () => {
    mockQuery.mockResolvedValueOnce(
      makeRows([
        {
          status: 'ready_for_governance',
          wallet_id: 'alice.testnet',
        },
      ])
    );
    mockQuery.mockResolvedValueOnce(makeRows([]));

    const res = await request(buildApp())
      .post('/v1/partners/cancel/test_app')
      .send({ wallet_id: 'alice.testnet' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe('none');
    expect(mockQuery.mock.calls[1]?.[0]).toMatch(/SET status = 'reopened'/);
  });

  it('rejects cancel when the application is already in governance', async () => {
    mockQuery.mockResolvedValueOnce(
      makeRows([
        {
          status: 'proposal_submitted',
          wallet_id: 'alice.testnet',
        },
      ])
    );

    const res = await request(buildApp())
      .post('/v1/partners/cancel/test_app')
      .send({ wallet_id: 'alice.testnet' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/Only governance-ready applications/);
  });

  it('requires both wallet_id and tx_hash', async () => {
    const res = await request(buildApp())
      .post('/v1/partners/proposal-submitted/test_app')
      .send({ wallet_id: 'alice.testnet' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/tx_hash is required/);
  });

  it('records a direct DAO proposal submission', async () => {
    mockQuery.mockResolvedValueOnce(
      makeRows([
        {
          status: 'ready_for_governance',
          wallet_id: 'alice.testnet',
          governance_proposal_description: 'Register test app',
          governance_proposal_dao: 'governance.onsocial.testnet',
          governance_proposal_payload: JSON.stringify(DRAFT_PROPOSAL.payload),
        },
      ])
    );
    mockQuery.mockResolvedValueOnce(makeRows([]));

    const res = await request(buildApp())
      .post('/v1/partners/proposal-submitted/test_app')
      .send({
        wallet_id: 'alice.testnet',
        proposal_id: 42,
        tx_hash: 'tx-hash-123',
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('proposal_submitted');
    expect(res.body.governance_proposal).toEqual(
      expect.objectContaining({
        proposal_id: 42,
        status: 'submitted',
        tx_hash: 'tx-hash-123',
        payload: DRAFT_PROPOSAL.payload,
      })
    );
  });

  it('rejects submissions from a different wallet', async () => {
    mockQuery.mockResolvedValueOnce(
      makeRows([
        {
          status: 'ready_for_governance',
          wallet_id: 'alice.testnet',
          governance_proposal_description: 'Register test app',
          governance_proposal_dao: 'governance.onsocial.testnet',
          governance_proposal_payload: JSON.stringify(DRAFT_PROPOSAL.payload),
        },
      ])
    );

    const res = await request(buildApp())
      .post('/v1/partners/proposal-submitted/test_app')
      .send({
        wallet_id: 'bob.testnet',
        proposal_id: 42,
        tx_hash: 'tx-hash-123',
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Wallet mismatch/);
  });
});

describe('POST /v1/partners/rotate-key/:wallet', () => {
  const storedKey =
    'os_live_abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

  it('requires the current api key header', async () => {
    const res = await request(buildApp()).post(
      '/v1/partners/rotate-key/alice.testnet'
    );

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/X-Api-Key header required/);
  });

  it('rejects invalid current api keys', async () => {
    mockQuery.mockResolvedValueOnce(
      makeRows([{ id: 1, app_id: 'test_app', api_key: storedKey }])
    );

    const res = await request(buildApp())
      .post('/v1/partners/rotate-key/alice.testnet')
      .set('X-Api-Key', 'short');

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Invalid API key/);
  });

  it('rotates the key for the active approved partner', async () => {
    mockQuery.mockResolvedValueOnce(
      makeRows([{ id: 42, app_id: 'test_app', api_key: storedKey }])
    );
    mockQuery.mockResolvedValueOnce(makeRows([]));

    const res = await request(buildApp())
      .post('/v1/partners/rotate-key/alice.testnet')
      .set('X-Api-Key', storedKey);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.app_id).toBe('test_app');
    expect(res.body.api_key).toMatch(/^os_live_[a-f0-9]{64}$/);
    expect(res.body.api_key).not.toBe(storedKey);
    expect(mockQuery.mock.calls[1]?.[0]).toMatch(
      /UPDATE partner_keys SET api_key/
    );
  });
});

describe('Partner key claim flow', () => {
  it('returns a stateless key-claim challenge for approved partners', async () => {
    mockQuery.mockResolvedValueOnce(
      makeRows([
        {
          app_id: 'test_app',
          label: 'Test App',
          status: 'approved',
          api_key: 'os_live_abc123',
          created_at: '2026-01-01',
          governance_proposal_status: 'executed',
        },
      ])
    );

    const res = await request(buildApp()).post(
      '/v1/partners/key-challenge/alice.testnet'
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.challenge.wallet_id).toBe('alice.testnet');
    expect(res.body.challenge.app_id).toBe('test_app');
    expect(res.body.challenge.recipient).toBe('OnSocial Partner Portal');
    expect(res.body.challenge.message).toContain('Wallet: alice.testnet');
    expect(res.body.challenge.message).toContain('App: test_app');
  });

  it('reveals the api key only after a valid wallet signature', async () => {
    const keyPair = nacl.sign.keyPair();
    const publicKey = `ed25519:${Buffer.from(keyPair.publicKey).toString('base64')}`;

    mockQuery.mockResolvedValueOnce(
      makeRows([
        {
          app_id: 'test_app',
          label: 'Test App',
          status: 'approved',
          api_key: 'os_live_abc123',
          created_at: '2026-01-01',
          governance_proposal_status: 'executed',
        },
      ])
    );

    const challengeRes = await request(buildApp()).post(
      '/v1/partners/key-challenge/alice.testnet'
    );

    const message = challengeRes.body.challenge.message as string;
    const nonce = Buffer.from(
      challengeRes.body.challenge.nonce as string,
      'base64'
    );
    const signature = Buffer.from(
      nacl.sign.detached(
        serializeNep413Payload({
          message,
          nonce,
          recipient: challengeRes.body.challenge.recipient as string,
          callbackUrl: null,
        }),
        keyPair.secretKey
      )
    ).toString('base64');

    mockQuery.mockResolvedValueOnce(
      makeRows([
        {
          app_id: 'test_app',
          label: 'Test App',
          status: 'approved',
          api_key: 'os_live_abc123',
          created_at: '2026-01-01',
          governance_proposal_status: 'executed',
        },
      ])
    );
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: { keys: [{ public_key: publicKey }] },
      }),
    });

    const res = await request(buildApp())
      .post('/v1/partners/claim-key/alice.testnet')
      .send({
        account_id: 'alice.testnet',
        public_key: publicKey,
        signature,
        message,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.api_key).toBe('os_live_abc123');
  });
});
