import { randomUUID } from 'crypto';
import { EntryType } from '../types/index.js';

export class JournalLine {
  public readonly id: string;
  public readonly accountId: string;
  public readonly accountCode: string;
  public readonly entryType: EntryType;
  public readonly amountCents: number;

  constructor(params: {
    id?: string;
    accountId: string;
    accountCode: string;
    entryType: EntryType;
    amountCents: number;
  }) {
    if (params.amountCents <= 0) {
      throw new Error(`Journal line amount must be positive. Received: ${params.amountCents}`);
    }
    this.id = params.id ?? randomUUID();
    this.accountId = params.accountId;
    this.accountCode = params.accountCode;
    this.entryType = params.entryType;
    this.amountCents = params.amountCents;
  }
}
