import { describe, expect, it } from 'vitest';
import { buildDaoPageMoodProposalPayload } from './dao-page-mood';
import { CORE_CONTRACT } from '@/lib/app-near-contract';

describe('buildDaoPageMoodProposalPayload', () => {
  it('wraps merged page/main mood as a core execute Call', () => {
    const payload = buildDaoPageMoodProposalPayload({
      moodId: 'protocol',
      currentConfig: { template: 'minimal' },
      daoLabel: 'OnSocial Governance',
    });

    expect(payload.proposal.description).toContain('protocol');
    expect(payload.proposal.description).toContain('OnSocial Governance');
    const kind = payload.proposal.kind as {
      FunctionCall: {
        receiver_id: string;
        actions: Array<{
          method_name: string;
          args: string;
          deposit: string;
          gas: string;
        }>;
      };
    };
    expect(kind.FunctionCall.receiver_id).toBe(CORE_CONTRACT);
    expect(kind.FunctionCall.actions[0]?.method_name).toBe('execute');

    const decoded = JSON.parse(
      Buffer.from(kind.FunctionCall.actions[0]!.args, 'base64').toString('utf8')
    ) as {
      request: {
        action: { type: string; data: { 'page/main': string } };
      };
    };
    expect(decoded.request.action.type).toBe('set');
    const pageMain = JSON.parse(decoded.request.action.data['page/main']) as {
      mood?: { id?: string };
      template?: string;
    };
    expect(pageMain.template).toBe('minimal');
    expect(pageMain.mood?.id).toBe('protocol');
  });
});
