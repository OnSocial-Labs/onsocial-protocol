export type Step = 'apply' | 'submitting' | 'pending' | 'approved' | 'rejected';

export interface AppRegistration {
  appId: string;
  apiKey: string;
  label: string;
}

export interface StatusResponse {
  success: boolean;
  status: 'none' | 'pending' | 'approved' | 'rejected';
  app_id?: string;
  label?: string;
  api_key?: string;
  applied_at?: string;
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
  expected_users: string;
  contact: string;
  wallet_id: string;
}

export interface ApplyResponse {
  success: boolean;
  app_id: string;
  label: string;
  status: string;
  error?: string;
}

export interface ApplicationFormData {
  appId: string;
  label: string;
  description: string;
  expectedUsers: string;
  contact: string;
}