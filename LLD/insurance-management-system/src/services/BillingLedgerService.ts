import { randomUUID } from 'crypto';
import { EntryType, TransactionType } from '../types/index.js';
import { DoubleEntryLedgerEngine } from '../patterns/ledger/DoubleEntryLedgerEngine.js';
import { JournalEntry } from '../models/JournalEntry.js';
import { TransactionalOutbox } from '../patterns/events/TransactionalOutbox.js';
import { DomainEvent } from '../patterns/events/DomainEvent.js';

export interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  policyId: string;
  totalAmountCents: number;
  paidAmountCents: number;
  status: 'PENDING' | 'PAID' | 'OVERDUE';
  dueDate: Date;
}

export class BillingLedgerService {
  private ledger: DoubleEntryLedgerEngine;
  private outbox: TransactionalOutbox;
  private invoices: Map<string, InvoiceRecord> = new Map();

  constructor(ledger: DoubleEntryLedgerEngine, outbox: TransactionalOutbox) {
    this.ledger = ledger;
    this.outbox = outbox;
  }

  public getLedgerEngine(): DoubleEntryLedgerEngine {
    return this.ledger;
  }

  /**
   * Generates a premium invoice and records Accounts Receivable in Ledger
   * Ledger: Debit AR-PREMIUM, Credit UNEARNED-PREMIUM
   */
  public generatePremiumInvoice(policyId: string, amountCents: number): InvoiceRecord {
    const invoiceId = randomUUID();
    const invoiceNumber = `INV-${randomUUID().slice(0, 8).toUpperCase()}`;

    const invoice: InvoiceRecord = {
      id: invoiceId,
      invoiceNumber,
      policyId,
      totalAmountCents: amountCents,
      paidAmountCents: 0,
      status: 'PENDING',
      dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14), // 14 days
    };

    this.invoices.set(invoice.id, invoice);
    this.invoices.set(invoice.invoiceNumber, invoice);

    // Record in double-entry general ledger
    this.ledger.recordTransaction({
      transactionType: TransactionType.PREMIUM_INVOICED,
      idempotencyKey: `INV-INIT-${invoiceId}`,
      referenceId: policyId,
      description: `Invoiced annual premium for policy ${policyId}`,
      entries: [
        { accountCode: '1200-AR-PREMIUM', entryType: EntryType.DEBIT, amountCents },
        { accountCode: '2200-UNEARNED-PREMIUM', entryType: EntryType.CREDIT, amountCents },
      ],
    });

    return invoice;
  }

  /**
   * Captures customer payment
   * Ledger: Debit CASH, Credit AR-PREMIUM
   */
  public capturePayment(params: {
    invoiceId: string;
    amountCents: number;
    paymentMethod: string;
    idempotencyKey: string;
  }): JournalEntry {
    const invoice = this.invoices.get(params.invoiceId);
    if (!invoice) {
      throw new Error(`Invoice ${params.invoiceId} not found.`);
    }

    const journalEntry = this.ledger.recordTransaction({
      transactionType: TransactionType.PAYMENT_CAPTURED,
      idempotencyKey: params.idempotencyKey,
      referenceId: invoice.policyId,
      description: `Payment captured via ${params.paymentMethod} for invoice ${invoice.invoiceNumber}`,
      entries: [
        { accountCode: '1010-CASH', entryType: EntryType.DEBIT, amountCents: params.amountCents },
        { accountCode: '1200-AR-PREMIUM', entryType: EntryType.CREDIT, amountCents: params.amountCents },
      ],
    });

    invoice.paidAmountCents += params.amountCents;
    if (invoice.paidAmountCents >= invoice.totalAmountCents) {
      invoice.status = 'PAID';
    }

    this.outbox.append(
      new DomainEvent({
        aggregateType: 'BILLING',
        aggregateId: invoice.policyId,
        eventType: 'PaymentCaptured',
        payload: {
          invoiceId: invoice.id,
          policyId: invoice.policyId,
          amountCents: params.amountCents,
          journalEntryId: journalEntry.id,
        },
      })
    );

    return journalEntry;
  }

  /**
   * Allocates Loss Reserve on Ledger
   * Ledger: Debit CLAIM-LOSS-EXPENSE, Credit LOSS-RESERVES
   */
  public allocateLossReserve(claimId: string, amountCents: number, idempotencyKey: string): JournalEntry {
    return this.ledger.recordTransaction({
      transactionType: TransactionType.LOSS_RESERVE_ALLOCATED,
      idempotencyKey,
      referenceId: claimId,
      description: `Loss reserve allocated for claim ${claimId}`,
      entries: [
        { accountCode: '5010-CLAIM-LOSS-EXPENSE', entryType: EntryType.DEBIT, amountCents },
        { accountCode: '2100-LOSS-RESERVES', entryType: EntryType.CREDIT, amountCents },
      ],
    });
  }

  /**
   * Executes Claim Settlement Disbursement
   * Ledger: Debit LOSS-RESERVES, Credit CASH
   */
  public disburseClaimPayout(claimId: string, amountCents: number, idempotencyKey: string): JournalEntry {
    return this.ledger.recordTransaction({
      transactionType: TransactionType.CLAIM_PAYOUT_SETTLED,
      idempotencyKey,
      referenceId: claimId,
      description: `Claim settlement payment disbursed for claim ${claimId}`,
      entries: [
        { accountCode: '2100-LOSS-RESERVES', entryType: EntryType.DEBIT, amountCents },
        { accountCode: '1010-CASH', entryType: EntryType.CREDIT, amountCents },
      ],
    });
  }

  /**
   * Issues refund during compensation
   * Ledger: Debit UNEARNED-PREMIUM, Credit CASH
   */
  public issueRefund(policyId: string, amountCents: number, idempotencyKey: string): JournalEntry {
    return this.ledger.recordTransaction({
      transactionType: TransactionType.PREMIUM_REFUND_ISSUED,
      idempotencyKey,
      referenceId: policyId,
      description: `Premium refunded for cancelled/failed policy ${policyId}`,
      entries: [
        { accountCode: '2200-UNEARNED-PREMIUM', entryType: EntryType.DEBIT, amountCents },
        { accountCode: '1010-CASH', entryType: EntryType.CREDIT, amountCents },
      ],
    });
  }
}
