import { PolicyStatus } from '../../types/index.js';
import { IPolicyState } from './IPolicyState.js';
import type { Policy } from '../../models/Policy.js';
import type { PolicyVersion } from '../../models/PolicyVersion.js';

export class CancelledState implements IPolicyState {
  public readonly status = PolicyStatus.CANCELLED;

  public submitPayment(_policy: Policy): void {
    throw new Error('Cannot accept payment for CANCELLED policy.');
  }

  public activate(_policy: Policy): void {
    throw new Error('Cannot directly activate a CANCELLED policy. Requires reinstatement underwriting.');
  }

  public endorse(_policy: Policy, _newVersion: PolicyVersion): void {
    throw new Error('Cannot endorse a CANCELLED policy.');
  }

  public cancel(_policy: Policy, _reason: string): void {
    // Already cancelled
  }

  public lapse(_policy: Policy): void {
    throw new Error('Cannot lapse an already CANCELLED policy.');
  }
}
