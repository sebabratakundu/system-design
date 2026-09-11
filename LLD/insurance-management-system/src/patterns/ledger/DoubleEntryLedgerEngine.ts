import { AccountType, EntryType, TransactionType } from '../../types/index.js';
import { LedgerAccount } from '../../models/LedgerAccount.js';
import { JournalEntry } from '../../models/JournalEntry.js';
import { JournalLine } from '../../models/JournalLine.js';

export class DoubleEntryLedgerEngine {
  private accounts: Map<string, LedgerAccount> = new Map();
  private journalEntries: Map<string, JournalEntry> = new Map();
  private idempotencyRegistry: Map<string, JournalEntry> = new Map();

  constructor() {
    this.initializeStandardChartOfAccounts();
  }

  private initializeStandardChartOfAccounts(): void {
    const defaultAccounts: Array<{ code: string; name: string; type: AccountType }> = [
      { code: '1010-CASH', name: 'Operating Cash', type: AccountType.ASSET },
      { code: '1200-AR-PREMIUM', name: 'Accounts Receivable (Premiums)', type: AccountType.ASSET },
      { code: '2100-LOSS-RESERVES', name: 'Claim Loss Reserves Payable', type: AccountType.LIABILITY },
      { code: '2200-UNEARNED-PREMIUM', name: 'Unearned Premium Reserve', type: AccountType.LIABILITY },
      { code: '4010-EARNED-PREMIUM', name: 'Earned Premium Revenue', type: AccountType.REVENUE },
      { code: '5010-CLAIM-LOSS-EXPENSE', name: 'Incurred Claim Loss Expense', type: AccountType.EXPENSE },
    ];

    for (const acc of defaultAccounts) {
      this.accounts.set(acc.code, new LedgerAccount({ accountCode: acc.code, name: acc.name, accountType: acc.type }));
    }
  }

  public getAccount(code: string): LedgerAccount {
    const acc = this.accounts.get(code);
    if (!acc) {
      throw new Error(`Ledger account ${code} does not exist in Chart of Accounts.`);
    }
    return acc;
  }

  public getAllAccounts(): readonly LedgerAccount[] {
    return Array.from(this.accounts.values());
  }

  public recordTransaction(params: {
    transactionType: TransactionType;
    idempotencyKey: string;
    referenceId?: string;
    description: string;
    entries: Array<{ accountCode: string; entryType: EntryType; amountCents: number }>;
  }): JournalEntry {
    // Check idempotency
    const existing = this.idempotencyRegistry.get(params.idempotencyKey);
    if (existing) {
      return existing;
    }

    // Build journal lines and verify accounts
    const lines: JournalLine[] = [];
    for (const item of params.entries) {
      const account = this.getAccount(item.accountCode);
      lines.push(
        new JournalLine({
          accountId: account.id,
          accountCode: account.accountCode,
          entryType: item.entryType,
          amountCents: item.amountCents,
        })
      );
    }

    // Validate debit/credit balance (will throw if imbalanced)
    const journalEntry = new JournalEntry({
      transactionType: params.transactionType,
      idempotencyKey: params.idempotencyKey,
      referenceId: params.referenceId,
      description: params.description,
      lines,
    });

    // Apply balances to accounts atomically
    for (const line of journalEntry.lines) {
      const account = this.getAccount(line.accountCode);
      account.applyEntry(line.entryType === EntryType.DEBIT ? 'DEBIT' : 'CREDIT', line.amountCents);
    }

    this.journalEntries.set(journalEntry.id, journalEntry);
    this.idempotencyRegistry.set(params.idempotencyKey, journalEntry);

    return journalEntry;
  }

  public getTrialBalance(): { totalDebitsCents: number; totalCreditsCents: number; isBalanced: boolean } {
    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalRevenue = 0;
    let totalExpenses = 0;

    for (const acc of this.accounts.values()) {
      if (acc.accountType === AccountType.ASSET) totalAssets += acc.balanceCents;
      if (acc.accountType === AccountType.EXPENSE) totalExpenses += acc.balanceCents;
      if (acc.accountType === AccountType.LIABILITY) totalLiabilities += acc.balanceCents;
      if (acc.accountType === AccountType.REVENUE) totalRevenue += acc.balanceCents;
    }

    const leftSide = totalAssets + totalExpenses;
    const rightSide = totalLiabilities + totalRevenue;

    return {
      totalDebitsCents: leftSide,
      totalCreditsCents: rightSide,
      isBalanced: leftSide === rightSide,
    };
  }
}
