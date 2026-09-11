import { PolicyStatus } from '../../types/index.js';
import { IPolicyState } from './IPolicyState.js';
import type { Policy } from '../../models/Policy.js';
import type { PolicyVersion } from '../../models/PolicyVersion.js';

export class LapsedState implements IPolicyState {
  public readonly status = PolicyStatus.LAPSED;

  public submitPayment(policy: Policy): void {
    // Grace-period payment reinstatement logic
    policy.setState(new (require('./ActiveState.js').ActiveState)());
  }

  public activate(policy: Policy): void {
    policy.setState(new (require('./ActiveState.js').ActiveState)());
  }

  public endorse(_policy: Policy, _newVersion: PolicyVersion): void {
    throw new Error('Cannot endorse a LAPSED policy.');
  }

  public cancel(policy: Policy, reason: string): void {
    policy.cancellationReason = reason;
    policy.cancellationDate = new Date();
    policy.setState(new (require('./CancelledState.js').CancelledState)());
  }

  public lapse(_policy: Policy): void {
    // Already lapsed
  }
}
