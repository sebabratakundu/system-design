import Database from 'better-sqlite3';
import { z } from 'zod';

/**
 * PRODUCTION-GRADE SINGLE RESPONSIBILITY PRINCIPLE (SRP) IMPLEMENTATION
 * 
 * 🟢 SRP RULE: "A class should have one, and only one, reason to change."
 * 
 * Each domain concern is extracted into a dedicated, single-purpose class with interface abstractions:
 * 1. OrderValidator            -> Reason to change: Input validation schema/rules change.
 * 2. TaxAndDiscountCalculator   -> Reason to change: Pricing, taxes, or discount logic changes.
 * 3. SqlOrderRepository        -> Reason to change: Database schema or storage driver changes.
 * 4. StripePaymentProcessor     -> Reason to change: Payment gateway integration changes.
 * 5. ResendEmailNotifier        -> Reason to change: Email templates or notification provider changes.
 * 6. MetricsTelemetryLogger    -> Reason to change: Observability metrics format changes.
 * 7. OrderCheckoutOrchestrator -> Reason to change: High-level checkout process flow changes.
 */

// ============================================================================
// DOMAIN MODELS & INTERFACES (Clean Decoupling)
// ============================================================================

export interface OrderItem {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
}

export interface CheckoutRequest {
  orderId: string;
  userEmail: string;
  items: OrderItem[];
  promoCode?: string;
  paymentToken: string;
}

export interface PricingBreakdown {
  subtotal: number;
  discount: number;
  taxableAmount: number;
  tax: number;
  finalTotal: number;
}

export interface OrderRecord {
  orderId: string;
  userEmail: string;
  subtotal: number;
  tax: number;
  total: number;
  status: string;
}

// Interfaces for Dependency Inversion & Testability
export interface IOrderValidator {
  validate(request: CheckoutRequest): CheckoutRequest;
}

export interface ITaxAndDiscountCalculator {
  calculatePricing(items: OrderItem[], promoCode?: string): PricingBreakdown;
}

export interface IOrderRepository {
  saveOrder(record: OrderRecord): Promise<void>;
}

export interface IPaymentProcessor {
  processPayment(paymentToken: string, amountUsd: number): Promise<{ success: boolean; transactionId: string }>;
}

export interface INotificationService {
  sendReceipt(userEmail: string, orderId: string, totalAmount: number): Promise<void>;
}

export interface ITelemetryLogger {
  logOrderSuccess(orderId: string, amount: number, durationMs: number): void;
  logOrderFailure(orderId: string, error: string): void;
}

// ============================================================================
// SINGLE RESPONSIBILITY IMPLEMENTATIONS
// ============================================================================

/**
 * 1. ORDER VALIDATOR
 * Responsibility: Schema parsing and structural validation using Zod.
 */
export class OrderValidator implements IOrderValidator {
  private schema = z.object({
    orderId: z.string().min(1, 'Order ID is required'),
    userEmail: z.string().email('Invalid email address format'),
    items: z.array(
      z.object({
        productId: z.string().min(1),
        name: z.string().min(1),
        unitPrice: z.number().positive('Unit price must be positive'),
        quantity: z.number().int().positive('Quantity must be at least 1'),
      })
    ).min(1, 'Order must contain at least 1 item'),
    promoCode: z.string().optional(),
    paymentToken: z.string().min(5, 'Invalid payment token'),
  });

  public validate(request: CheckoutRequest): CheckoutRequest {
    const result = this.schema.safeParse(request);
    if (!result.success) {
      const errorMsg = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new Error(`[Validation Failed] ${errorMsg}`);
    }
    return result.data;
  }
}

/**
 * 2. TAX & DISCOUNT CALCULATOR
 * Responsibility: Business logic for calculating subtotals, promotional discounts, and regional taxes.
 */
export class TaxAndDiscountCalculator implements ITaxAndDiscountCalculator {
  private defaultTaxRate: number;

  constructor(defaultTaxRate: number = 0.08) {
    this.defaultTaxRate = defaultTaxRate;
  }

  public calculatePricing(items: OrderItem[], promoCode?: string): PricingBreakdown {
    const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

    let discount = 0;
    if (promoCode === 'SAVE20') {
      discount = subtotal * 0.20; // 20% discount coupon
    }

    const taxableAmount = Math.max(0, subtotal - discount);
    const tax = taxableAmount * this.defaultTaxRate;
    const finalTotal = taxableAmount + tax;

    return {
      subtotal: Number(subtotal.toFixed(2)),
      discount: Number(discount.toFixed(2)),
      taxableAmount: Number(taxableAmount.toFixed(2)),
      tax: Number(tax.toFixed(2)),
      finalTotal: Number(finalTotal.toFixed(2)),
    };
  }
}

/**
 * 3. SQL ORDER REPOSITORY
 * Responsibility: Persistence and transactional database queries using better-sqlite3.
 */
export class SqlOrderRepository implements IOrderRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.initTable();
  }

  private initTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS srp_orders (
        id TEXT PRIMARY KEY,
        user_email TEXT NOT NULL,
        subtotal REAL NOT NULL,
        tax REAL NOT NULL,
        total REAL NOT NULL,
        status TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  public async saveOrder(record: OrderRecord): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO srp_orders (id, user_email, subtotal, tax, total, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(record.orderId, record.userEmail, record.subtotal, record.tax, record.total, record.status);
  }
}

/**
 * 4. STRIPE PAYMENT PROCESSOR
 * Responsibility: Executing payment transactions against payment gateway.
 */
export class StripePaymentProcessor implements IPaymentProcessor {
  public async processPayment(paymentToken: string, amountUsd: number): Promise<{ success: boolean; transactionId: string }> {
    // Simulated Stripe Payment API integration
    if (!paymentToken || paymentToken === 'tok_invalid') {
      return { success: false, transactionId: '' };
    }
    const transactionId = `ch_stripe_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    return { success: true, transactionId };
  }
}

/**
 * 5. RESEND EMAIL NOTIFIER
 * Responsibility: Formatting email templates and dispatching email notifications.
 */
export class ResendEmailNotifier implements INotificationService {
  public async sendReceipt(userEmail: string, orderId: string, totalAmount: number): Promise<void> {
    // Simulated Resend / SendGrid Transactional Email API dispatch
    console.log(`  [Resend Email Notifier] Sent receipt email to ${userEmail} for Order #${orderId} ($${totalAmount.toFixed(2)})`);
  }
}

/**
 * 6. METRICS TELEMETRY LOGGER
 * Responsibility: Emitting application performance metrics and audit trails.
 */
export class MetricsTelemetryLogger implements ITelemetryLogger {
  public logOrderSuccess(orderId: string, amount: number, durationMs: number): void {
    console.log(`  [Telemetry Metrics] order_checkout_success=1 order_id=${orderId} total=$${amount} latency=${durationMs.toFixed(2)}ms`);
  }

  public logOrderFailure(orderId: string, error: string): void {
    console.log(`  [Telemetry Metrics] order_checkout_failure=1 order_id=${orderId} error="${error}"`);
  }
}

/**
 * 7. ORDER CHECKOUT ORCHESTRATOR
 * Responsibility: High-level workflow orchestration of checkout components.
 * 
 * Notice: This class DOES NOT know how validation is checked, how tax is calculated,
 * how SQL queries are run, or how Stripe/Resend APIs work! It simply coordinates them.
 */
export class OrderCheckoutOrchestrator {
  private validator: IOrderValidator;
  private pricingCalculator: ITaxAndDiscountCalculator;
  private orderRepository: IOrderRepository;
  private paymentProcessor: IPaymentProcessor;
  private notificationService: INotificationService;
  private telemetryLogger: ITelemetryLogger;

  constructor(
    validator: IOrderValidator,
    pricingCalculator: ITaxAndDiscountCalculator,
    orderRepository: IOrderRepository,
    paymentProcessor: IPaymentProcessor,
    notificationService: INotificationService,
    telemetryLogger: ITelemetryLogger
  ) {
    this.validator = validator;
    this.pricingCalculator = pricingCalculator;
    this.orderRepository = orderRepository;
    this.paymentProcessor = paymentProcessor;
    this.notificationService = notificationService;
    this.telemetryLogger = telemetryLogger;
  }

  public async checkout(request: CheckoutRequest): Promise<{ success: boolean; orderId: string; totalPaid: number }> {
    const startTime = performance.now();
    console.log(`\n[OrderCheckoutOrchestrator] Executing orchestrator flow for order #${request.orderId}...`);

    try {
      // 1. Validate Input
      const validRequest = this.validator.validate(request);

      // 2. Calculate Pricing
      const pricing = this.pricingCalculator.calculatePricing(validRequest.items, validRequest.promoCode);
      console.log(`  [Pricing] Subtotal: $${pricing.subtotal}, Tax: $${pricing.tax}, Total: $${pricing.finalTotal}`);

      // 3. Process Payment
      const paymentRes = await this.paymentProcessor.processPayment(validRequest.paymentToken, pricing.finalTotal);
      if (!paymentRes.success) {
        throw new Error('Payment processing rejected by payment gateway');
      }

      // 4. Save to Database
      await this.orderRepository.saveOrder({
        orderId: validRequest.orderId,
        userEmail: validRequest.userEmail,
        subtotal: pricing.subtotal,
        tax: pricing.tax,
        total: pricing.finalTotal,
        status: 'PAID',
      });

      // 5. Send Notification
      await this.notificationService.sendReceipt(validRequest.userEmail, validRequest.orderId, pricing.finalTotal);

      // 6. Log Metrics
      const durationMs = performance.now() - startTime;
      this.telemetryLogger.logOrderSuccess(validRequest.orderId, pricing.finalTotal, durationMs);

      return {
        success: true,
        orderId: validRequest.orderId,
        totalPaid: pricing.finalTotal,
      };
    } catch (err: any) {
      this.telemetryLogger.logOrderFailure(request.orderId, err.message || 'Unknown error');
      throw err;
    }
  }
}
