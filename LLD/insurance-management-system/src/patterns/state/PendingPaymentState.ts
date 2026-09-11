import { PolicyStatus } from '../../types/index.js';
import { IPolicyState } from './IPolicyState.js';
import { ActiveState } from './ActiveState.js';
import { CancelledState } from './CancelledState.js';
import type { Policy } from '../../models/Policy.js';
import type { PolicyVersion } from '../../models/PolicyVersion.js';

export class PendingPaymentState implements IPolicyState {
  public readonly status = PolicyStatus.PENDING_PAYMENT;

  public submitPayment(policy: Policy): void {
    // Payment verified; transition to active
    this.activate(policy);
  }

  public activate(policy: Policy): void {
    policy.setState(new ActiveState());
  }

  public endorse(_policy: Policy, _newVersion: PolicyVersion): void {
    throw new Error('Cannot endorse policy in PENDING_PAYMENT state. Policy must be ACTIVE first.');
  }

  public cancel(policy: Policy, reason: string): void {
    policy.cancellationReason = reason;
    policy.cancellationDate = new Date();
    policy.setState(new CancelledState());
  }

  public lapse(policy: Policy): void {
    this.cancel(policy, 'Lapsed due to non-payment during bind period.');
  }
}
