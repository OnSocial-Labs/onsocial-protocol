// ---------------------------------------------------------------------------
// Attestation (claim) queries.
// Accessed as `os.query.attestations.<method>()`.
// ---------------------------------------------------------------------------

import type { QueryModule } from './index.js';

export interface ClaimRow {
  issuer: string;
  subject: string;
  claimType: string;
  claimId: string;
  value: string;
  blockHeight: number;
  blockTimestamp: number;
  operation: string;
}

export class AttestationsQuery {
  constructor(private _q: QueryModule) {}

  /**
   * Attestations issued by an account.
   *
   * ```ts
   * const claims = await os.query.attestations.issued('alice.near');
   * ```
   */
  async issued(
    accountId: string,
    opts: { claimType?: string; limit?: number; offset?: number } = {}
  ): Promise<ClaimRow[]> {
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;
    const conditions = ['{issuer: {_eq: $id}}', '{operation: {_eq: "set"}}'];
    if (opts.claimType) conditions.push('{claimType: {_eq: $claimType}}');
    const where = `{_and: [${conditions.join(', ')}]}`;

    const res = await this._q.graphql<{ claimsCurrent: ClaimRow[] }>({
      query: `query ClaimsIssued($id: String!${opts.claimType ? ', $claimType: String!' : ''}, $limit: Int!, $offset: Int!) {
        claimsCurrent(
          where: ${where},
          limit: $limit, offset: $offset,
          orderBy: [{blockHeight: DESC}]
        ) {
          issuer subject claimType claimId value blockHeight blockTimestamp operation
        }
      }`,
      variables: {
        id: accountId,
        ...(opts.claimType ? { claimType: opts.claimType } : {}),
        limit,
        offset,
      },
    });
    return res.data?.claimsCurrent ?? [];
  }

  /**
   * Attestations about a subject.
   *
   * ```ts
   * const claims = await os.query.attestations.about('bob.near');
   * ```
   */
  async about(
    subject: string,
    opts: { claimType?: string; limit?: number; offset?: number } = {}
  ): Promise<ClaimRow[]> {
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;
    const conditions = [
      '{subject: {_eq: $subject}}',
      '{operation: {_eq: "set"}}',
    ];
    if (opts.claimType) conditions.push('{claimType: {_eq: $claimType}}');
    const where = `{_and: [${conditions.join(', ')}]}`;

    const res = await this._q.graphql<{ claimsCurrent: ClaimRow[] }>({
      query: `query ClaimsAbout($subject: String!${opts.claimType ? ', $claimType: String!' : ''}, $limit: Int!, $offset: Int!) {
        claimsCurrent(
          where: ${where},
          limit: $limit, offset: $offset,
          orderBy: [{blockHeight: DESC}]
        ) {
          issuer subject claimType claimId value blockHeight blockTimestamp operation
        }
      }`,
      variables: {
        subject,
        ...(opts.claimType ? { claimType: opts.claimType } : {}),
        limit,
        offset,
      },
    });
    return res.data?.claimsCurrent ?? [];
  }
}
