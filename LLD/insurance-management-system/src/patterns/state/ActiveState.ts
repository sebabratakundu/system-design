import { PolicyStatus } from '../../types/index.js';
import { IPolicyState } from './IPolicyState.js';
import { CancelledState } from './CancelledState.js';
import { LapsedState } from './LapsedState.js';
import type { Policy } from '../../models/Policy.js';
import type { PolicyVersion } from '../../models/PolicyVersion.js';

export class ActiveState implements IPolicyState {
  public readonly status = PolicyStatus.ACTIVE;

  public submitPayment(_policy: Policy): void {
    // Recurring premium payments do not change the ACTIVE state
  }

  public activate(_policy: Policy): void {
    // Already active
  }

  public endorse(policy: Policy, newVersion: PolicyVersion): void {
    policy.addVersion(newVersion);
  }

  public cancel(policy: Policy, reason: string): void {
    policy.cancellationReason = reason;
    policy.cancellationDate = new Date();
    policy.setState(new CancelledState());
  }

  public lapse(policy: Policy): void {
    policy.cancellationReason = 'Lapsed due to non-payment of renewal premium';
    policy.cancellationDate = new Date();
    policy.setState(new LapsedState());
  }
}
