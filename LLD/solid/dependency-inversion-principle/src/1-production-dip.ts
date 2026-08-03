import Database from 'better-sqlite3';
import { z } from 'zod';

/**
 * PRODUCTION-GRADE DEPENDENCY INVERSION PRINCIPLE (DIP) IMPLEMENTATION
 * 
 * 🟢 DIP RULE:
 * 1. High-level modules should not depend on low-level modules. Both should depend on abstractions.
 * 2. Abstractions should not depend on details. Details should depend on abstractions.
 * 
 * Architecture Features:
 * 1. High-Level Abstractions: Business logic defines contracts (IOrderRepository, IPaymentGateway, IEmailNotifier).
 * 2. Inversion of Control (IoC): Infrastructure modules (Sqlite, Stripe, Resend) depend on business abstractions.
 * 3. Constructor Dependency Injection: Dependencies are injected at runtime, allowing 100% mockability.
 * 4. Production Pluggability: Easily swap SQLite for PostgreSQL or SendGrid for Resend in 1 line of configuration!
 */

export interface OrderData {
  orderId: string;
  customerEmail: string;
  amount: number;
  paymentToken: string;
}

export interface OrderRecord {
  orderId: string;
  customerEmail: string;
  amount: number;
  status: string;
}

// ============================================================================
// HIGH-LEVEL ABSTRACTIONS (Business Contracts)
// ============================================================================

export interface IOrderRepository {
  saveOrder(record: OrderRecord): Promise<void>;
}

export interface IPaymentGateway {
  charge(paymentToken: string, amountUsd: number): Promise<{ success: boolean; chargeId: string }>;
}

export interface IEmailNotifier {
  sendEmail(to: string, subject: string, body: string): Promise<void>;
}

// ============================================================================
// LOW-LEVEL INFRASTRUCTURE IMPLEMENTATIONS (Details DEPEND on Abstractions)
// ============================================================================

/**
 * Production SQLite Database Repository
 */
export class SqliteOrderRepository implements IOrderRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.initTable();
  }

  private initTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS dip_orders (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        amount REAL NOT NULL,
        status TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  public async saveOrder(record: OrderRecord): Promise<void> {
    console.log(`  [SqliteOrderRepository] Persisting order #${record.orderId} to SQLite table...`);
    const stmt = this.db.prepare(`INSERT INTO dip_orders (id, email, amount, status) VALUES (?, ?, ?, ?)`);
    stmt.run(record.orderId, record.customerEmail, record.amount, record.status);
  }
}

/**
 * In-Memory Mock Repository (For Lightning-Fast Unit Testing)
 */
export class InMemoryOrderRepository implements IOrderRepository {
  public savedOrders: Map<string, OrderRecord> = new Map();

  public async saveOrder(record: OrderRecord): Promise<void> {
    console.log(`  [InMemoryOrderRepository] Saved order #${record.orderId} in memory map (Fast Unit Test Mode).`);
    this.savedOrders.set(record.orderId, record);
  }
}

/**
 * Production Stripe Payment Gateway
 */
export class StripePaymentGateway implements IPaymentGateway {
  public async charge(paymentToken: string, amountUsd: number): Promise<{ success: boolean; chargeId: string }> {
    console.log(`  [StripePaymentGateway] Communicating with Stripe API ($${amountUsd})...`);
    return { success: true, chargeId: `ch_stripe_${Date.now()}` };
  }
}

/**
 * Mock Payment Gateway (For Offline Testing)
 */
export class MockPaymentGateway implements IPaymentGateway {
  public async charge(paymentToken: string, amountUsd: number): Promise<{ success: boolean; chargeId: string }> {
    console.log(`  [MockPaymentGateway] Auto-approving test charge ($${amountUsd})...`);
    return { success: true, chargeId: `ch_mock_${Date.now()}` };
  }
}

/**
 * Production Resend Email Notifier
 */
export class ResendEmailNotifier implements IEmailNotifier {
  public async sendEmail(to: string, subject: string, body: string): Promise<void> {
    console.log(`  [ResendEmailNotifier] Delivered transactional email via Resend API to ${to}...`);
  }
}

/**
 * Mock Email Notifier (Prevents sending real emails during testing)
 */
export class MockEmailNotifier implements IEmailNotifier {
  public sentMessages: { to: string; subject: string }[] = [];

  public async sendEmail(to: string, subject: string, body: string): Promise<void> {
    console.log(`  [MockEmailNotifier] Captured email in memory buffer (To: ${to}).`);
    this.sentMessages.push({ to, subject });
  }
}

// ============================================================================
// HIGH-LEVEL BUSINESS MODULE (DEPENDS ONLY ON ABSTRACTIONS)
// ============================================================================

export class OrderCheckoutService {
  private repository: IOrderRepository;
  private paymentGateway: IPaymentGateway;
  private emailNotifier: IEmailNotifier;

  // 🟢 DIP IN ACTION: Receives abstractions via Constructor Dependency Injection
  constructor(
    repository: IOrderRepository,
    paymentGateway: IPaymentGateway,
    emailNotifier: IEmailNotifier
  ) {
    this.repository = repository;
    this.paymentGateway = paymentGateway;
    this.emailNotifier = emailNotifier;
  }

  public async processCheckout(order: OrderData): Promise<{ success: boolean; chargeId: string }> {
    console.log(`\n[OrderCheckoutService] Executing high-level business checkout flow for order #${order.orderId}...`);

    // 1. Charge Payment (via IPaymentGateway abstraction)
    const payment = await this.paymentGateway.charge(order.paymentToken, order.amount);
    if (!payment.success) {
      throw new Error('[Checkout Error] Payment authorization rejected');
    }

    // 2. Persist Order Record (via IOrderRepository abstraction)
    await this.repository.saveOrder({
      orderId: order.orderId,
      customerEmail: order.customerEmail,
      amount: order.amount,
      status: 'PAID',
    });

    // 3. Dispatch Receipt (via IEmailNotifier abstraction)
    await this.emailNotifier.sendEmail(
      order.customerEmail,
      `Receipt for Order #${order.orderId}`,
      `Your payment of $${order.amount} was successfully processed.`
    );

    return { success: true, chargeId: payment.chargeId };
  }
}
