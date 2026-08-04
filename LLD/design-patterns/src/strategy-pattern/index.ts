import { LRUCache } from "lru-cache";

/**
 * ============================================================================
 * PRODUCTION-GRADE STRATEGY PATTERN: PAYMENT & LEDGER PROCESSING ENGINE
 * ============================================================================
 *
 * @description
 * The Strategy Pattern defines a family of algorithms, encapsulates each one,
 * and makes them interchangeable. Strategy lets the algorithm vary independently
 * from clients that use it.
 *
 * Real-World System Design Scenario:
 * A high-volume E-Commerce Payment Gateway that supports multiple payment methods
 * (Stripe, PayPal, In-Memory LRU Credit Ledger, Redis Ledger). The PaymentProcessor
 * (Context) delegates execution to the selected PaymentStrategy. Strategies can
 * be dynamically swapped at runtime for failover, AB testing, or method switching.
 */

// ============================================================================
// 1. DOMAIN MODELS & DTOs
// ============================================================================

export interface TransactionRequest {
  id: string;
  userId: string;
  amount: number;
  currency: "USD" | "EUR" | "INR";
  metadata?: Record<string, unknown>;
}

export interface PaymentResult {
  success: boolean;
  transactionId: string;
  provider: string;
  amountProcessed: number;
  timestamp: Date;
  error?: string;
}

/**
 * Standardized Custom Domain Error for Strategy Failures
 */
export class PaymentStrategyError extends Error {
  constructor(
    public readonly provider: string,
    message: string,
    public readonly originalError?: Error,
  ) {
    super(`[${provider}] Payment Processing Failed: ${message}`);
    this.name = "PaymentStrategyError";
  }
}

// ============================================================================
// 2. STRATEGY INTERFACE
// ============================================================================

/**
 * Common interface for all Payment Gateway / Ledger Strategies.
 */
export interface IPaymentStrategy {
  /** Name identifier of the payment strategy provider */
  readonly providerName: string;

  /**
   * Processes a transaction using the specific provider strategy.
   * @param request The transaction request DTO
   */
  process(request: TransactionRequest): Promise<PaymentResult>;

  /**
   * Validates whether the strategy can handle the given transaction amount/currency.
   */
  validate(request: TransactionRequest): boolean;
}

// ============================================================================
// 3. CONCRETE STRATEGIES
// ============================================================================

/**
 * Concrete Strategy: Stripe Card Gateway Integration
 */
export class StripePaymentStrategy implements IPaymentStrategy {
  public readonly providerName = "Stripe";

  constructor(private readonly apiKey: string) {
    if (!apiKey) {
      throw new Error("Stripe API key is required");
    }
  }

  validate(request: TransactionRequest): boolean {
    return request.amount > 0 && ["USD", "EUR"].includes(request.currency);
  }

  async process(request: TransactionRequest): Promise<PaymentResult> {
    if (!this.validate(request)) {
      throw new PaymentStrategyError(
        this.providerName,
        `Invalid currency '${request.currency}' or amount <= 0 for Stripe.`,
      );
    }

    try {
      // Simulate real external API network latency and idempotency processing
      await new Promise((resolve) => setTimeout(resolve, 80));

      console.log(
        `[Stripe API] Charged $${request.amount} ${request.currency} for User ${request.userId} (IdempotencyKey: stripe_${request.id})`,
      );

      return {
        success: true,
        transactionId: `ch_stripe_${request.id}_${Date.now()}`,
        provider: this.providerName,
        amountProcessed: request.amount,
        timestamp: new Date(),
      };
    } catch (err: any) {
      throw new PaymentStrategyError(this.providerName, err.message, err);
    }
  }
}

/**
 * Concrete Strategy: PayPal Wallet Integration
 */
export class PayPalPaymentStrategy implements IPaymentStrategy {
  public readonly providerName = "PayPal";

  constructor(private readonly clientId: string) {}

  validate(request: TransactionRequest): boolean {
    return request.amount > 0;
  }

  async process(request: TransactionRequest): Promise<PaymentResult> {
    if (!this.validate(request)) {
      throw new PaymentStrategyError(
        this.providerName,
        "Invalid transaction amount for PayPal.",
      );
    }

    // Simulate PayPal capture flow
    await new Promise((resolve) => setTimeout(resolve, 50));

    console.log(
      `[PayPal API] Captured payout ${request.amount} ${request.currency} for User ${request.userId}`,
    );

    return {
      success: true,
      transactionId: `PAYPAL-PAY-${request.id}`,
      provider: this.providerName,
      amountProcessed: request.amount,
      timestamp: new Date(),
    };
  }
}

/**
 * Concrete Strategy: Local In-Memory LRU Credit Balance Ledger
 * Uses real `lru-cache` package for sub-millisecond local balance deductions.
 */
export class LRUCreditLedgerStrategy implements IPaymentStrategy {
  public readonly providerName = "LRUCreditLedger";
  private cache: LRUCache<string, number>;

  constructor(maxUsers = 5000) {
    this.cache = new LRUCache<string, number>({
      max: maxUsers,
      ttl: 1000 * 60 * 60, // 1 hour TTL
    });

    // Seed mock balances for demonstration
    this.cache.set("user_101", 500.0);
    this.cache.set("user_102", 50.0);
  }

  validate(request: TransactionRequest): boolean {
    const currentBalance = this.cache.get(request.userId) ?? 0;
    return currentBalance >= request.amount;
  }

  async process(request: TransactionRequest): Promise<PaymentResult> {
    const currentBalance = this.cache.get(request.userId) ?? 0;

    if (currentBalance < request.amount) {
      throw new PaymentStrategyError(
        this.providerName,
        `Insufficient LRU credit balance for user ${request.userId}. Balance: ${currentBalance}, Required: ${request.amount}`,
      );
    }

    const newBalance = currentBalance - request.amount;
    this.cache.set(request.userId, newBalance);

    console.log(
      `[LRU Ledger] Deducted ${request.amount}. User ${request.userId} new credit balance: $${newBalance}`,
    );

    return {
      success: true,
      transactionId: `lru_ledger_${request.id}`,
      provider: this.providerName,
      amountProcessed: request.amount,
      timestamp: new Date(),
    };
  }
}

// ============================================================================
// 4. CONTEXT CLASS
// ============================================================================

/**
 * PaymentProcessor (The Context in Strategy Pattern)
 * Maintains a reference to one of the PaymentStrategy objects and delegates
 * execution. Supports runtime strategy mutation and automated failover.
 */
export class PaymentProcessor {
  constructor(private primaryStrategy: IPaymentStrategy) {}

  /**
   * Dynamically swaps the active strategy at runtime.
   * Enables runtime strategy switching (e.g., fallback when provider is degraded).
   */
  public setStrategy(newStrategy: IPaymentStrategy): void {
    console.log(
      `\n🔄 [Strategy Swap] Switching payment strategy: ${this.primaryStrategy.providerName} ➡️ ${newStrategy.providerName}`,
    );
    this.primaryStrategy = newStrategy;
  }

  /**
   * Retrieves the current strategy provider name.
   */
  public getActiveProvider(): string {
    return this.primaryStrategy.providerName;
  }

  /**
   * Executes transaction using the currently configured strategy.
   */
  public async executePayment(
    request: TransactionRequest,
  ): Promise<PaymentResult> {
    console.log(
      `\n💳 [PaymentProcessor] Processing Tx ${request.id} ($${request.amount} ${request.currency}) via ${this.primaryStrategy.providerName}...`,
    );

    try {
      return await this.primaryStrategy.process(request);
    } catch (error: any) {
      console.error(
        `❌ [PaymentProcessor Error] Failed with strategy '${this.primaryStrategy.providerName}': ${error.message}`,
      );
      throw error;
    }
  }
}

// ============================================================================
// 5. DEMO & VERIFICATION EXECUTION
// ============================================================================

async function runDemo() {
  console.log("=================================================");
  console.log("   STRATEGY PATTERN - PRODUCTION PAYMENT ENGINE  ");
  console.log("=================================================\n");

  // Initialize strategies
  const stripeStrategy = new StripePaymentStrategy("sk_test_mock_key_123");
  const paypalStrategy = new PayPalPaymentStrategy("client_id_paypal_abc");
  const lruLedgerStrategy = new LRUCreditLedgerStrategy(1000);

  // Initialize Context with Stripe Strategy as Primary
  const processor = new PaymentProcessor(stripeStrategy);

  const tx1: TransactionRequest = {
    id: "TX-1001",
    userId: "user_101",
    amount: 120.5,
    currency: "USD",
  };

  // 1. Process via Stripe
  const res1 = await processor.executePayment(tx1);
  console.log("Result 1:", res1);

  // 2. Dynamically switch strategy to PayPal at runtime
  processor.setStrategy(paypalStrategy);
  const tx2: TransactionRequest = {
    id: "TX-1002",
    userId: "user_101",
    amount: 45.0,
    currency: "USD",
  };
  const res2 = await processor.executePayment(tx2);
  console.log("Result 2:", res2);

  // 3. Dynamically switch strategy to In-Memory LRU Credit Ledger
  processor.setStrategy(lruLedgerStrategy);
  const tx3: TransactionRequest = {
    id: "TX-1003",
    userId: "user_101",
    amount: 200.0,
    currency: "USD",
  };
  const res3 = await processor.executePayment(tx3);
  console.log("Result 3:", res3);

  // 4. Test Strategy Failover / Insufficient Credit Error Handling
  try {
    const tx4: TransactionRequest = {
      id: "TX-1004",
      userId: "user_101",
      amount: 9999.0, // Exceeds balance
      currency: "USD",
    };
    await processor.executePayment(tx4);
  } catch (err: any) {
    console.log("Caught Expected Error:", err.message);
  }
}

// Execute demo if run directly
runDemo().catch(console.error);
