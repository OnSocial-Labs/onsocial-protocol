// ---------------------------------------------------------------------------
// Jobs module — create / remove org hiring listings
// ---------------------------------------------------------------------------

import type { SocialModule } from './social.js';
import type { QueryModule } from '../query/index.js';
import type { RelayResponse } from '../types.js';
import {
  buildJobRemoveData,
  buildJobSetData,
  createJobId,
  type JobBuildInput,
} from '../builders/jobs.js';
import type { JobSearchRow } from '../query/jobs.js';

export class JobsModule {
  constructor(
    private _social: SocialModule,
    private _query: QueryModule
  ) {}

  async create(
    input: JobBuildInput,
    opts?: { wait?: boolean; jobId?: string }
  ): Promise<{ jobId: string; result: RelayResponse }> {
    const jobId = opts?.jobId?.trim() || createJobId();
    const result = await this._social.set(buildJobSetData(jobId, input), opts);
    return { jobId, result };
  }

  async remove(
    jobId: string,
    opts?: { wait?: boolean }
  ): Promise<RelayResponse> {
    return this._social.set(buildJobRemoveData(jobId), opts);
  }

  async openFor(accountId: string): Promise<JobSearchRow[]> {
    return this._query.jobs.openForAccount(accountId);
  }

  async forAccount(
    accountId: string,
    opts?: { limit?: number; includeClosed?: boolean }
  ): Promise<JobSearchRow[]> {
    return this._query.jobs.forAccount(accountId, opts);
  }
}
