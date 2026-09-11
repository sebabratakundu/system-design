import { randomUUID } from 'crypto';
import { AccountType } from '../types/index.js';

export class LedgerAccount {
  public readonly id: string;
  public readonly accountCode: string;
  public readonly name: string;
  public readonly accountType: AccountType;
  public readonly currency: string;
  public balanceCents: number = 0;

  constructor(params: {
    id?: string;
    accountCode: string;
    name: string;
    accountType: AccountType;
    currency?: string;
  }) {
    this.id = params.id ?? randomUUID();
    this.accountCode = params.accountCode;
    this.name = params.name;
    this.accountType = params.accountType;
    this.currency = params.currency ?? 'USD';
  }

  /**
   * Normal Balance Rules:
   * - Assets & Expenses increase with DEBIT, decrease with CREDIT
   * - Liabilities, Equity & Revenue increase with CREDIT, decrease with DEBIT
   */
  public applyEntry(entryType: 'DEBIT' | 'CREDIT', amountCents: number): void {
    if (this.accountType === AccountType.ASSET || this.accountType === AccountType.EXPENSE) {
      if (entryType === 'DEBIT') {
        this.balanceCents += amountCents;
      } else {
        this.balanceCents -= amountCents;
      }
    } else {
      // LIABILITY, EQUITY, REVENUE
      if (entryType === 'CREDIT') {
        this.balanceCents += amountCents;
      } else {
        this.balanceCents -= amountCents;
      }
    }
  }
}
