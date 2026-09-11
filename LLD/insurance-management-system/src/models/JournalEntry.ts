import { randomUUID } from 'crypto';
import { EntryType, TransactionType } from '../types/index.js';
import { JournalLine } from './JournalLine.js';

export class JournalEntry {
  public readonly id: string;
  public readonly transactionType: TransactionType;
  public readonly idempotencyKey: string;
  public readonly referenceId?: string;
  public readonly description: string;
  public readonly lines: JournalLine[] = [];
  public readonly createdAt: Date;

  constructor(params: {
    id?: string;
    transactionType: TransactionType;
    idempotencyKey: string;
    referenceId?: string;
    description: string;
    lines: JournalLine[];
  }) {
    this.id = params.id ?? randomUUID();
    this.transactionType = params.transactionType;
    this.idempotencyKey = params.idempotencyKey;
    this.referenceId = params.referenceId;
    this.description = params.description;
    this.createdAt = new Date();

    this.validateAndSetLines(params.lines);
  }

  private validateAndSetLines(lines: JournalLine[]): void {
    if (lines.length < 2) {
      throw new Error('Double-entry journal entry must have at least two lines (one debit, one credit).');
    }

    let totalDebits = 0;
    let totalCredits = 0;

    for (const line of lines) {
      if (line.entryType === EntryType.DEBIT) {
        totalDebits += line.amountCents;
      } else {
        totalCredits += line.amountCents;
      }
      this.lines.push(line);
    }

    if (totalDebits !== totalCredits) {
      throw new Error(
        `Double-Entry Invariant Violation: Mismatched Debits ($${(totalDebits / 100).toFixed(2)}) and Credits ($${(totalCredits / 100).toFixed(2)})`
      );
    }
  }

  public get totalAmountCents(): number {
    return this.lines
      .filter((l) => l.entryType === EntryType.DEBIT)
      .reduce((sum, l) => sum + l.amountCents, 0);
  }
}
