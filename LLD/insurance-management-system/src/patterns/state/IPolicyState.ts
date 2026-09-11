import { PolicyStatus } from '../../types/index.js';
import type { Policy } from '../../models/Policy.js';
import type { PolicyVersion } from '../../models/PolicyVersion.js';

export interface IPolicyState {
  readonly status: PolicyStatus;
  submitPayment(policy: Policy): void;
  activate(policy: Policy): void;
  endorse(policy: Policy, newVersion: PolicyVersion): void;
  cancel(policy: Policy, reason: string): void;
  lapse(policy: Policy): void;
}
