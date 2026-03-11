import type { ContractParams, ParamErrors } from '@/features/admin/types';

export function cleanNumeric(raw: string): string {
  let cleaned = raw.replace(/[^0-9.]/g, '');
  const dotIdx = cleaned.indexOf('.');
  if (dotIdx !== -1) {
    cleaned =
      cleaned.slice(0, dotIdx + 1) +
      cleaned.slice(dotIdx + 1).replace(/\./g, '');
  }
  return cleaned;
}

export function normalizeNumeric(raw: string): string {
  if (!raw || raw === '.') return '0';
  const parsed = parseFloat(raw);
  if (isNaN(parsed)) return '0';
  return String(parsed);
}

export function validateParams(values: ContractParams): ParamErrors {
  const errors: ParamErrors = {};
  const rewardPerAction = parseFloat(values.rewardPerAction);
  const dailyCap = parseFloat(values.dailyCap);
  const totalBudget = parseFloat(values.totalBudget);
  const dailyBudget = parseFloat(values.dailyBudget);

  const MAX_RPA = 1;
  const MAX_DC = 10;

  if (isNaN(rewardPerAction) || rewardPerAction < 0) {
    errors.rewardPerAction = 'Must be a number ≥ 0';
  } else if (rewardPerAction === 0) {
    errors.rewardPerAction = 'Must be > 0 (users earn nothing otherwise)';
  } else if (rewardPerAction > MAX_RPA) {
    errors.rewardPerAction = `Max ${MAX_RPA} SOCIAL per action`;
  }

  if (isNaN(dailyCap) || dailyCap < 0) {
    errors.dailyCap = 'Must be a number ≥ 0';
  } else if (dailyCap === 0) {
    errors.dailyCap = 'Must be > 0 (users hit cap immediately)';
  } else if (dailyCap > MAX_DC) {
    errors.dailyCap = `Max ${MAX_DC} SOCIAL per user per day`;
  } else if (rewardPerAction > 0 && dailyCap > 0 && rewardPerAction > dailyCap) {
    errors.dailyCap = 'Must be ≥ reward_per_action';
  }

  if (isNaN(totalBudget) || totalBudget < 0) {
    errors.totalBudget = 'Must be a number ≥ 0';
  } else if (totalBudget === 0) {
    errors.totalBudget = 'Required — every app needs a lifetime cap';
  }

  if (isNaN(dailyBudget) || dailyBudget < 0) {
    errors.dailyBudget = 'Must be a number ≥ 0';
  }

  return errors;
}

export function hasErrors(errors: ParamErrors): boolean {
  return Object.keys(errors).length > 0;
}