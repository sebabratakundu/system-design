import Database from 'better-sqlite3';
import { z } from 'zod';

/**
 * PRODUCTION-GRADE LISKOV SUBSTITUTION PRINCIPLE (LSP) IMPLEMENTATION
 * 
 * 🟢 LSP RULE: "Subtypes must be completely substitutable for their base types without altering
 *    the correctness of the program, throwing unexpected exceptions, or weakening contracts."
 * 
 * Architecture Features:
 * 1. Interface Segregation: Distinguishes between IPayable (payment processing) and IRefundablePayable (refund capability).
 * 2. Precondition Preservation: Subtypes accept all valid inputs specified by base contract without adding stricter limits.
 * 3. Postcondition Preservation: Subtypes return valid, non-null RefundReceipt results complying with base contracts.
 * 4. Zero Defensive Type Checks: Client code operates purely on IRefundablePayable with 100% behavioral substitutability.
 */

export interface RefundReceipt {
  refundId: string;
  providerName: string;
  amountRefunded: number;
  timestamp: string;
}

/**
 * Base Payable Contract (Every payment provider supports receiving payments)
 */
export interface IPayable {
  readonly providerName: string;
  processPayment(orderId: string, amount: number): Promise<{ success: boolean; transactionId: string }>;
}

/**
 * Sub-interface for Refundable Payment Providers (Behavioral Subtyping)
 */
export interface IRefundablePayable extends IPayable {
  processRefund(transactionId: string, amount: number): Promise<RefundReceipt>;
}

// ============================================================================
// CONCRETE LSP-COMPLIANT IMPLEMENTATIONS
// ============================================================================

/**
 * 1. Credit Card Processor (Supports Payment & Refund)
 */
export class CreditCardProcessor implements IRefundablePayable {
  public readonly providerName = 'Stripe Credit Card';

  public async processPayment(orderId: string, amount: number): Promise<{ success: boolean; transactionId: string }> {
    console.log(`  [CreditCard] Charging $${amount} for Order #${orderId}...`);
    return { success: true, transactionId: `ch_cc_${Date.now()}` };
  }

  public async processRefund(transactionId: string, amount: number): Promise<RefundReceipt> {
    if (amount <= 0) throw new Error('[LSP Contract Precondition] Refund amount must be positive');
    console.log(`  [CreditCard] Executing Stripe refund for $${amount} on TxID [${transactionId}]...`);
    return {
      refundId: `re_cc_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      providerName: this.providerName,
      amountRefunded: amount,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * 2. PayPal Processor (Supports Payment & Refund)
 */
export class PayPalProcessor implements IRefundablePayable {
  public readonly providerName = 'PayPal Express';

  public async processPayment(orderId: string, amount: number): Promise<{ success: boolean; transactionId: string }> {
    console.log(`  [PayPal] Executing checkout for Order #${orderId} ($${amount})...`);
    return { success: true, transactionId: `ch_pp_${Date.now()}` };
  }

  public async processRefund(transactionId: string, amount: number): Promise<RefundReceipt> {
    if (amount <= 0) throw new Error('[LSP Contract Precondition] Refund amount must be positive');
    console.log(`  [PayPal] Executing PayPal API refund for $${amount} on TxID [${transactionId}]...`);
    return {
      refundId: `re_pp_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      providerName: this.providerName,
      amountRefunded: amount,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * 3. Crypto Processor (Supports Payment ONLY - DOES NOT implement IRefundablePayable!)
 * 
 * 🟢 LSP COMPLIANT: Because Crypto cannot be refunded, it DOES NOT implement IRefundablePayable.
 * It strictly implements IPayable, preventing it from ever being passed to refund processing clients!
 */
export class CryptoProcessor implements IPayable {
  public readonly providerName = 'Ethereum Web3 Gateway';

  public async processPayment(orderId: string, amount: number): Promise<{ success: boolean; transactionId: string }> {
    console.log(`  [Crypto] Executing Web3 on-chain transfer for Order #${orderId} ($${amount})...`);
    return { success: true, transactionId: `ch_eth_${Date.now()}` };
  }
}

/**
 * 4. Gift Card Processor (Supports Store Credit Refund - Fully Compliant)
 */
export class GiftCardProcessor implements IRefundablePayable {
  public readonly providerName = 'Gift Card Store Credit';

  public async processPayment(orderId: string, amount: number): Promise<{ success: boolean; transactionId: string }> {
    console.log(`  [GiftCard] Debiting store credit for Order #${orderId} ($${amount})...`);
    return { success: true, transactionId: `ch_gc_${Date.now()}` };
  }

  public async processRefund(transactionId: string, amount: number): Promise<RefundReceipt> {
    if (amount <= 0) throw new Error('[LSP Contract Precondition] Refund amount must be positive');
    // 🟢 LSP COMPLIANT: Accurately processes store credit refunds for any valid amount without throwing unexpected errors!
    console.log(`  [GiftCard] Restoring $${amount} store credit balance for TxID [${transactionId}]...`);
    return {
      refundId: `re_gc_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      providerName: this.providerName,
      amountRefunded: amount,
      timestamp: new Date().toISOString(),
    };
  }
}

// ============================================================================
// CLIENT BATCH PROCESSOR (100% Behavioral Substitutability)
// ============================================================================

export class ProductionRefundBatchProcessor {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.initTable();
  }

  private initTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lsp_refunds (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        amount REAL NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  /**
   * 🟢 LSP IN ACTION: Client operates purely on IRefundablePayable.
   * Every passed instance is 100% substitutable and guaranteed to process refunds without error!
   */
  public async processBatch(
    items: { processor: IRefundablePayable; transactionId: string; amount: number }[]
  ): Promise<number> {
    console.log(`\n[ProductionRefundBatchProcessor] Processing batch of ${items.length} refundable transactions...`);
    let processedCount = 0;

    for (const item of items) {
      // Zero instanceof checks required! Polymorphic substitution guaranteed by design.
      console.log(`  Processing refund via [${item.processor.providerName}]...`);
      const receipt = await item.processor.processRefund(item.transactionId, item.amount);

      const stmt = this.db.prepare(`INSERT INTO lsp_refunds (id, provider, amount) VALUES (?, ?, ?)`);
      stmt.run(receipt.refundId, receipt.providerName, receipt.amountRefunded);
      processedCount++;
    }

    return processedCount;
  }
}
