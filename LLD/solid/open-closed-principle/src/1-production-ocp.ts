import Database from 'better-sqlite3';
import { z } from 'zod';

/**
 * PRODUCTION-GRADE OPEN-CLOSED PRINCIPLE (OCP) IMPLEMENTATION
 * 
 * 🟢 OCP RULE: "Software entities should be OPEN for extension, but CLOSED for modification."
 * 
 * Architecture Features:
 * 1. IPaymentStrategy (Abstraction Contract): Every payment method is implemented as an independent Strategy class.
 * 2. PaymentStrategyRegistry (Plugin Registry): Dynamically accepts new payment strategies at runtime or app bootstrap.
 * 3. Open for Extension: Adding a new payment method (e.g. Klarna, UPI, WeChat Pay) requires ONLY creating a new strategy file.
 * 4. Closed for Modification: Core payment processor code and existing strategies remain untouched and zero regression risk!
 */

export interface PaymentPayload {
  orderId: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  details: Record<string, any>;
}

export interface PaymentExecutionResult {
  success: boolean;
  transactionId: string;
  providerName: string;
  amountPaid: number;
  timestamp: string;
}

/**
 * Unified Payment Strategy Interface (Contract for Extension)
 */
export interface IPaymentStrategy {
  readonly methodCode: string;
  readonly providerName: string;
  validatePayload(payload: PaymentPayload): void;
  executePayment(payload: PaymentPayload): Promise<{ success: boolean; transactionId: string }>;
}

// ============================================================================
// CONCRETE PAYMENT STRATEGIES (Extensible Modules)
// ============================================================================

/**
 * 1. Credit Card Strategy
 */
export class CreditCardStrategy implements IPaymentStrategy {
  public readonly methodCode = 'CREDIT_CARD';
  public readonly providerName = 'Stripe Credit Card';

  private schema = z.object({
    cardNumber: z.string().min(13, 'Card number must be at least 13 digits'),
    cvv: z.string().min(3).max(4),
  });

  public validatePayload(payload: PaymentPayload): void {
    const res = this.schema.safeParse(payload.details);
    if (!res.success) {
      throw new Error(`[CreditCard Strategy Validation] ${res.error.errors.map((e) => e.message).join(', ')}`);
    }
  }

  public async executePayment(payload: PaymentPayload): Promise<{ success: boolean; transactionId: string }> {
    this.validatePayload(payload);
    console.log(`  [CreditCard Strategy] Charging card ending in ${payload.details.cardNumber.slice(-4)} for $${payload.amount}...`);
    const transactionId = `tx_cc_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    return { success: true, transactionId };
  }
}

/**
 * 2. PayPal Strategy
 */
export class PayPalStrategy implements IPaymentStrategy {
  public readonly methodCode = 'PAYPAL';
  public readonly providerName = 'PayPal Express';

  private schema = z.object({
    paypalEmail: z.string().email('Invalid PayPal email address'),
  });

  public validatePayload(payload: PaymentPayload): void {
    const res = this.schema.safeParse(payload.details);
    if (!res.success) {
      throw new Error(`[PayPal Strategy Validation] ${res.error.errors.map((e) => e.message).join(', ')}`);
    }
  }

  public async executePayment(payload: PaymentPayload): Promise<{ success: boolean; transactionId: string }> {
    this.validatePayload(payload);
    console.log(`  [PayPal Strategy] Executing PayPal OAuth token transfer for ${payload.details.paypalEmail}...`);
    const transactionId = `tx_pp_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    return { success: true, transactionId };
  }
}

/**
 * 3. Crypto Web3 Strategy
 */
export class CryptoStrategy implements IPaymentStrategy {
  public readonly methodCode = 'CRYPTO';
  public readonly providerName = 'Ethereum Web3 Gateway';

  private schema = z.object({
    walletAddress: z.string().startsWith('0x', 'Wallet address must start with 0x'),
  });

  public validatePayload(payload: PaymentPayload): void {
    const res = this.schema.safeParse(payload.details);
    if (!res.success) {
      throw new Error(`[Crypto Strategy Validation] ${res.error.errors.map((e) => e.message).join(', ')}`);
    }
  }

  public async executePayment(payload: PaymentPayload): Promise<{ success: boolean; transactionId: string }> {
    this.validatePayload(payload);
    console.log(`  [Crypto Strategy] Verifying smart contract transaction for wallet ${payload.details.walletAddress}...`);
    const transactionId = `tx_eth_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    return { success: true, transactionId };
  }
}

/**
 * 4. NEW EXTENSION: Klarna Strategy (Added WITHOUT modifying any existing code!)
 */
export class KlarnaStrategy implements IPaymentStrategy {
  public readonly methodCode = 'KLARNA';
  public readonly providerName = 'Klarna Buy Now Pay Later';

  private schema = z.object({
    installmentPlanMonths: z.number().int().positive('Installment months must be positive'),
    ssnLast4: z.string().length(4, 'SSN last 4 digits required'),
  });

  public validatePayload(payload: PaymentPayload): void {
    const res = this.schema.safeParse(payload.details);
    if (!res.success) {
      throw new Error(`[Klarna Strategy Validation] ${res.error.errors.map((e) => e.message).join(', ')}`);
    }
  }

  public async executePayment(payload: PaymentPayload): Promise<{ success: boolean; transactionId: string }> {
    this.validatePayload(payload);
    console.log(`  [Klarna Strategy] Originating ${payload.details.installmentPlanMonths}-month BNPL credit plan for $${payload.amount}...`);
    const transactionId = `tx_klarna_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    return { success: true, transactionId };
  }
}

// ============================================================================
// STRATEGY REGISTRY & CORE PROCESSOR (Closed for Modification)
// ============================================================================

export class PaymentStrategyRegistry {
  private strategies: Map<string, IPaymentStrategy> = new Map();

  public register(strategy: IPaymentStrategy): void {
    const code = strategy.methodCode.toUpperCase();
    if (this.strategies.has(code)) {
      console.log(`  [Registry Warning] Overwriting strategy for method: ${code}`);
    }
    this.strategies.set(code, strategy);
    console.log(`  🔌 Registered Payment Strategy: [${code}] -> (${strategy.providerName})`);
  }

  public getStrategy(methodCode: string): IPaymentStrategy {
    const strategy = this.strategies.get(methodCode.toUpperCase());
    if (!strategy) {
      throw new Error(`[Strategy Error] No payment strategy registered for method: "${methodCode}"`);
    }
    return strategy;
  }

  public getRegisteredMethods(): string[] {
    return Array.from(this.strategies.keys());
  }
}

export class OcpPaymentProcessor {
  private registry: PaymentStrategyRegistry;
  private db: Database.Database;

  constructor(registry: PaymentStrategyRegistry, db: Database.Database) {
    this.registry = registry;
    this.db = db;
    this.initTable();
  }

  private initTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ocp_payments (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        amount REAL NOT NULL,
        method TEXT NOT NULL,
        provider TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  public async process(payload: PaymentPayload): Promise<PaymentExecutionResult> {
    console.log(`\n[OcpPaymentProcessor] Delegating ${payload.paymentMethod} payment for Order #${payload.orderId}...`);

    // 🟢 OCP IN ACTION: No switch/if-else statement!
    // Lookup strategy dynamically from registry and delegate polymorphic execution.
    const strategy = this.registry.getStrategy(payload.paymentMethod);
    const result = await strategy.executePayment(payload);

    if (!result.success) {
      throw new Error(`Payment processing failed via ${strategy.providerName}`);
    }

    // Persist Payment Record
    const stmt = this.db.prepare(`
      INSERT INTO ocp_payments (id, order_id, amount, method, provider, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(result.transactionId, payload.orderId, payload.amount, payload.paymentMethod, strategy.providerName, 'SUCCESS');

    return {
      success: true,
      transactionId: result.transactionId,
      providerName: strategy.providerName,
      amountPaid: payload.amount,
      timestamp: new Date().toISOString(),
    };
  }
}
