import Database from 'better-sqlite3';

/**
 * DIP ANTI-PATTERN: Hardcoded Concrete Dependencies (Tight Coupling)
 * 
 * 🔴 WHY THIS VIOLATES THE DEPENDENCY INVERSION PRINCIPLE (DIP):
 * 1. HIGH-LEVEL MODULE DEPENDS ON LOW-LEVEL DETAILS: OrderCheckoutManager (high-level business policy)
 *    directly instantiates ConcreteSqliteDatabase, ConcreteStripeClient, and ConcreteSendGridMailer (low-level details).
 * 2. IMPOSSIBLE UNIT TESTING: Unit testing business rules in isolation requires initializing real database files
 *    and making actual network/SMTP connections.
 * 3. EXTREME RIGIDITY: Swapping SQLite for PostgreSQL or SendGrid for Resend requires opening and modifying
 *    high-level business logic inside OrderCheckoutManager!
 */

export interface OrderPayload {
  orderId: string;
  customerEmail: string;
  amount: number;
  stripeToken: string;
}

// Low-Level Detail 1: Concrete Database Driver
export class ConcreteSqliteDatabase {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS hardcoded_orders (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        amount REAL NOT NULL,
        status TEXT NOT NULL
      );
    `);
  }

  public saveOrder(id: string, email: string, amount: number, status: string) {
    console.log(`  [ConcreteSqliteDatabase] Writing record to hardcoded_orders table...`);
    const stmt = this.db.prepare(`INSERT INTO hardcoded_orders (id, email, amount, status) VALUES (?, ?, ?, ?)`);
    stmt.run(id, email, amount, status);
  }

  public close() {
    this.db.close();
  }
}

// Low-Level Detail 2: Concrete Stripe API Client
export class ConcreteStripeClient {
  public chargeCard(token: string, amount: number): { success: boolean; chargeId: string } {
    console.log(`  [ConcreteStripeClient] Executing direct HTTP POST to api.stripe.com for $${amount}...`);
    return { success: true, chargeId: `ch_stripe_${Date.now()}` };
  }
}

// Low-Level Detail 3: Concrete SendGrid Mailer
export class ConcreteSendGridMailer {
  public sendEmail(to: string, subject: string, body: string): void {
    console.log(`  [ConcreteSendGridMailer] Dispatching SMTP payload via SendGrid API to ${to}...`);
  }
}

/**
 * 🔴 HIGH-LEVEL BUSINESS MODULE (DIRECTLY DEPENDS ON LOW-LEVEL DETAILS)
 */
export class OrderCheckoutManagerAntiPattern {
  // Hardcoded concrete fields
  private db: ConcreteSqliteDatabase;
  private stripeClient: ConcreteStripeClient;
  private mailer: ConcreteSendGridMailer;

  constructor(dbPath: string) {
    // 💥 DIP VIOLATION: Directly instantiating concrete low-level details inside constructor!
    this.db = new ConcreteSqliteDatabase(dbPath);
    this.stripeClient = new ConcreteStripeClient();
    this.mailer = new ConcreteSendGridMailer();
  }

  public async checkout(order: OrderPayload): Promise<boolean> {
    console.log(`\n[OrderCheckoutManagerAntiPattern] Processing order #${order.orderId}...`);

    // 1. Hardcoded Stripe Payment Charge
    const payment = this.stripeClient.chargeCard(order.stripeToken, order.amount);
    if (!payment.success) throw new Error('Payment failed');

    // 2. Hardcoded SQLite Database Persistence
    this.db.saveOrder(order.orderId, order.customerEmail, order.amount, 'COMPLETED');

    // 3. Hardcoded SendGrid Email Notification
    this.mailer.sendEmail(
      order.customerEmail,
      `Order Confirmation #${order.orderId}`,
      `Thank you for your purchase of $${order.amount}!`
    );

    return true;
  }

  public close() {
    this.db.close();
  }
}
