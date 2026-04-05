export type Step =
  | 'apply'
  | 'submitting'
  | 'pending'
  | 'eligibility'
  | 'governance'
  | 'claiming'
  | 'approved'
  | 'rejected';

export interface AppRegistration {
  appId: string;
  apiKey: string | null;
  label: string;
}

export interface GovernanceProposalAction {
  method_name: string;
  args: string;
  deposit: string;
  gas: number;
}

export interface GovernanceProposalPayload {
  proposal: {
    description: string;
    kind: {
      FunctionCall: {
        receiver_id: string;
        actions: GovernanceProposalAction[];
      };
    };
  };
}

export interface GovernanceProposal {
  proposal_id: number | null;
  status: string;
  description: string | null;
  dao_account: string | null;
  tx_hash: string | null;
  submitted_at: string | null;
  payload?: GovernanceProposalPayload | null;
}

export interface StatusResponse {
  success: boolean;
  status:
    | 'none'
    | 'pending'
    | 'ready_for_governance'
    | 'proposal_submitted'
    | 'approved'
    | 'rejected';
  app_id?: string;
  label?: string;
  applied_at?: string;
  governance_proposal?: GovernanceProposal | null;
  application_form?: ApplicationFormPrefill | null;
  error?: string;
}

export interface KeyChallenge {
  app_id: string;
  wallet_id: string;
  recipient: string;
  nonce: string;
  message: string;
  issued_at: string;
  expires_at: string;
}

export interface KeyChallengeResponse {
  success: boolean;
  challenge?: KeyChallenge;
  error?: string;
}

export interface ClaimKeyResponse {
  success: boolean;
  app_id?: string;
  label?: string;
  api_key?: string;
  error?: string;
}

export interface RotateResponse {
  success: boolean;
  app_id?: string;
  api_key?: string;
  error?: string;
}

export interface ApplyBody {
  app_id?: string;
  label: string;
  description: string;
  wallet_id: string;
  audience_band: string;
  website_url?: string;
  telegram_handle?: string;
  x_handle?: string;
}

export interface ApplyResponse {
  success: boolean;
  app_id: string;
  label: string;
  status: string;
  governance_proposal?: GovernanceProposal | null;
  error?: string;
}

export interface AppIdAvailabilityResponse {
  success: boolean;
  app_id?: string;
  available?: boolean;
  status?: string;
  source?: 'application' | 'onchain';
  error?: string;
}

export interface ProposalSubmissionResponse {
  success: boolean;
  app_id: string;
  status: 'proposal_submitted';
  governance_proposal?: GovernanceProposal | null;
  error?: string;
}

export interface CancelApplicationResponse {
  success: boolean;
  app_id?: string;
  status?: 'none';
  error?: string;
}

export interface ReopenApplicationResponse {
  success: boolean;
  app_id?: string;
  status?: 'reopened';
  already_reopened?: boolean;
  error?: string;
}

export interface ApplicationFormData {
  appId: string;
  label: string;
  description: string;
  audienceBand: string;
  websiteUrl: string;
  telegramHandle: string;
  xHandle: string;
}

export interface ApplicationFormSnapshot extends ApplicationFormData {}

export interface ApplicationFormPrefill {
  appId: string;
  label: string;
  description: string;
  audienceBand: string;
  websiteUrl: string;
  telegramHandle: string;
  xHandle: string;
}
