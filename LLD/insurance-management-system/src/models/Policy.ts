import { randomUUID } from 'crypto';
import { LineOfBusiness, PolicyStatus } from '../types/index.js';
import { IPolicyState } from '../patterns/state/IPolicyState.js';
import { PendingPaymentState } from '../patterns/state/PendingPaymentState.js';
import { PolicyVersion } from './PolicyVersion.js';

export class Policy {
  public readonly id: string;
  public readonly policyNumber: string;
  public readonly policyholderId: string;
  public readonly lineOfBusiness: LineOfBusiness;
  public readonly termStartDate: Date;
  public readonly termEndDate: Date;
  public cancellationDate?: Date;
  public cancellationReason?: string;
  public readonly createdAt: Date;
  public updatedAt: Date;

  private state: IPolicyState;
  private versions: PolicyVersion[] = [];

  constructor(params: {
    id?: string;
    policyNumber?: string;
    policyholderId: string;
    lineOfBusiness: LineOfBusiness;
    termStartDate: Date;
    termEndDate: Date;
    initialVersion?: PolicyVersion;
  }) {
    this.id = params.id ?? randomUUID();
    this.policyNumber = params.policyNumber ?? `POL-${randomUUID().slice(0, 8).toUpperCase()}`;
    this.policyholderId = params.policyholderId;
    this.lineOfBusiness = params.lineOfBusiness;
    this.termStartDate = params.termStartDate;
    this.termEndDate = params.termEndDate;
    this.state = new PendingPaymentState();
    this.createdAt = new Date();
    this.updatedAt = new Date();

    if (params.initialVersion) {
      this.versions.push(params.initialVersion);
    }
  }

  public get status(): PolicyStatus {
    return this.state.status;
  }

  public setState(state: IPolicyState): void {
    this.state = state;
    this.updatedAt = new Date();
  }

  public get currentVersion(): PolicyVersion {
    if (this.versions.length === 0) {
      throw new Error(`Policy ${this.policyNumber} has no versions recorded.`);
    }
    return this.versions[this.versions.length - 1]!;
  }

  public getAllVersions(): readonly PolicyVersion[] {
    return this.versions;
  }

  public addVersion(version: PolicyVersion): void {
    this.versions.push(version);
    this.updatedAt = new Date();
  }

  /**
   * Bi-Temporal Coverage Query: Returns the exact policy version in effect at dateOfLoss
   */
  public getVersionAt(dateOfLoss: Date): PolicyVersion | undefined {
    return this.versions.find((v) => v.isEffectiveAt(dateOfLoss));
  }

  // State machine delegation methods
  public submitPayment(): void {
    this.state.submitPayment(this);
  }

  public activate(): void {
    this.state.activate(this);
  }

  public endorse(newVersion: PolicyVersion): void {
    this.state.endorse(this, newVersion);
  }

  public cancel(reason: string): void {
    this.state.cancel(this, reason);
  }

  public lapse(): void {
    this.state.lapse(this);
  }
}
