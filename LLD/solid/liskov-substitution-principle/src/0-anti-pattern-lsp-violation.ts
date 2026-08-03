import Database from 'better-sqlite3';

/**
 * LSP ANTI-PATTERN: Behavioral Contract Violation (Broken Substitutability)
 * 
 * 🔴 WHY THIS VIOLATES THE LISKOV SUBSTITUTION PRINCIPLE (LSP):
 * 1. BROKEN BEHAVIORAL CONTRACT: Base class BasePaymentMethod defines processRefund().
 *    Subclass CryptoPayment inherits from BasePaymentMethod but THROWS AN EXCEPTION on refund,
 *    refusing to fulfill the contract expected by clients.
 * 2. STRENGTHENED PRECONDITIONS: Subclass GiftCardPayment restricts max refund amount to $50,
 *    imposing stricter preconditions than the base class (which allows any valid positive amount).
 * 3. DEFENSIVE TYPE CHECKS: Client code (RefundBatchProcessor) is forced to perform runtime
 *    type checks (if (payment instanceof CryptoPayment)) to avoid crashes in production!
 */

export abstract class BasePaymentMethod {
  public providerName: string;

  constructor(providerName: string) {
    this.providerName = providerName;
  }

  // Base contract promises that all PaymentMethods can process refunds!
  public abstract processRefund(transactionId: string, amount: number): { success: boolean; refundId: string };
}

export class CreditCardPayment extends BasePaymentMethod {
  constructor() {
    super('Stripe Credit Card');
  }

  public processRefund(transactionId: string, amount: number): { success: boolean; refundId: string } {
    console.log(`  [CreditCard Subtype] Processing $${amount} refund for TxID [${transactionId}]...`);
    return { success: true, refundId: `re_cc_${Date.now()}` };
  }
}

export class PayPalPayment extends BasePaymentMethod {
  constructor() {
    super('PayPal Express');
  }

  public processRefund(transactionId: string, amount: number): { success: boolean; refundId: string } {
    console.log(`  [PayPal Subtype] Executing PayPal API refund for $${amount} on TxID [${transactionId}]...`);
    return { success: true, refundId: `re_pp_${Date.now()}` };
  }
}

/**
 * 🔴 LSP VIOLATION 1: CryptoPayment throws runtime exception on base method invocation!
 */
export class CryptoPayment extends BasePaymentMethod {
  constructor() {
    super('Ethereum Web3 Gateway');
  }

  public processRefund(transactionId: string, amount: number): { success: boolean; refundId: string } {
    // 💥 VIOLATION: Throws exception on method guaranteed by base contract!
    throw new Error(`[LSP Violation Error] Crypto transactions are on-chain immutable and NON-REFUNDABLE!`);
  }
}

/**
 * 🔴 LSP VIOLATION 2: GiftCardPayment strengthens preconditions (stricter rules than base class)!
 */
export class GiftCardPayment extends BasePaymentMethod {
  constructor() {
    super('Gift Card Store Credit');
  }

  public processRefund(transactionId: string, amount: number): { success: boolean; refundId: string } {
    // 💥 VIOLATION: Strengthens precondition! Base class accepts any positive amount, but subclass rejects > $50.
    if (amount > 50) {
      throw new Error(`[LSP Precondition Violation] Gift card store policy prohibits refunds greater than $50 (Attempted: $${amount})`);
    }
    console.log(`  [GiftCard Subtype] Restoring $${amount} store credit balance for TxID [${transactionId}]...`);
    return { success: true, refundId: `re_gc_${Date.now()}` };
  }
}

/**
 * Client batch processor attempting to use polymorphism with BasePaymentMethod
 */
export class RefundBatchProcessorAntiPattern {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS monolithic_refunds (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        amount REAL NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  /**
   * Naive polymorphic execution expecting all BasePaymentMethod instances to be substitutable
   */
  public async processBatchNaive(
    payments: { method: BasePaymentMethod; transactionId: string; amount: number }[]
  ): Promise<number> {
    console.log(`\n[RefundBatchProcessorAntiPattern] Running NAIVE polymorphic refund batch (${payments.length} payments)...`);
    let processedCount = 0;

    for (const item of payments) {
      // 💥 CRASH RISK: Will throw exception when CryptoPayment or GiftCard ($>50) is encountered!
      console.log(`  Attempting refund via provider [${item.method.providerName}]...`);
      const result = item.method.processRefund(item.transactionId, item.amount);
      
      const stmt = this.db.prepare(`INSERT INTO monolithic_refunds (id, provider, amount) VALUES (?, ?, ?)`);
      stmt.run(result.refundId, item.method.providerName, item.amount);
      processedCount++;
    }

    return processedCount;
  }

  /**
   * Ugly defensive workaround required due to LSP violation
   */
  public async processBatchDefensive(
    payments: { method: BasePaymentMethod; transactionId: string; amount: number }[]
  ): Promise<number> {
    console.log(`\n[RefundBatchProcessorAntiPattern] Running DEFENSIVE (Type-Checking) refund batch (${payments.length} payments)...`);
    let processedCount = 0;

    for (const item of payments) {
      // 🔴 UGLY CODE SMELL: Defensive instanceof checks required because subtypes violate base contract!
      if (item.method instanceof CryptoPayment) {
        console.log(`  ⚠️ [Defensive Skip] Skipping CryptoPayment (Known LSP violation: non-refundable)!`);
        continue;
      }

      if (item.method instanceof GiftCardPayment && item.amount > 50) {
        console.log(`  ⚠️ [Defensive Skip] Skipping GiftCard ($${item.amount} > $50 precondition limit)!`);
        continue;
      }

      const result = item.method.processRefund(item.transactionId, item.amount);
      const stmt = this.db.prepare(`INSERT INTO monolithic_refunds (id, provider, amount) VALUES (?, ?, ?)`);
      stmt.run(result.refundId, item.method.providerName, item.amount);
      processedCount++;
    }

    return processedCount;
  }

  public close() {
    this.db.close();
  }
}
