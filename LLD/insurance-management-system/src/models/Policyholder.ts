import { randomUUID } from 'crypto';

export class Policyholder {
  public readonly id: string;
  public readonly accountId: string;
  public firstName: string;
  public lastName: string;
  public email: string;
  public phone: string;
  public dateOfBirth: Date;
  public riskTier: 'PREFERRED' | 'STANDARD' | 'NON_STANDARD' | 'HIGH_RISK';
  public readonly createdAt: Date;

  constructor(params: {
    id?: string;
    accountId?: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    dateOfBirth: Date;
    riskTier?: 'PREFERRED' | 'STANDARD' | 'NON_STANDARD' | 'HIGH_RISK';
  }) {
    this.id = params.id ?? randomUUID();
    this.accountId = params.accountId ?? `ACC-${randomUUID().slice(0, 8).toUpperCase()}`;
    this.firstName = params.firstName;
    this.lastName = params.lastName;
    this.email = params.email;
    this.phone = params.phone;
    this.dateOfBirth = params.dateOfBirth;
    this.riskTier = params.riskTier ?? 'STANDARD';
    this.createdAt = new Date();
  }

  get fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }
}
