import Database from 'better-sqlite3';

/**
 * SRP ANTI-PATTERN: The Monolithic "God Class" (MonolithicOrderProcessor)
 * 
 * 🔴 WHY THIS VIOLATES THE SINGLE RESPONSIBILITY PRINCIPLE (SRP):
 * This single class has AT LEAST 6 SEPARATE REASONS TO CHANGE:
 * 1. Input validation schema/rules change (e.g. email regex, min order amount)
 * 2. Financial calculation / tax rules change (e.g. state tax, promo code logic)
 * 3. Database persistence schema or SQL changes (e.g. SQLite -> PostgreSQL)
 * 4. Payment gateway integration changes (e.g. Stripe API updates)
 * 5. Email notification template or delivery provider changes (e.g. SMTP -> Resend API)
 * 6. Audit logging & observability metric format changes
 * 
 * Tight coupling makes unit testing almost impossible without mocking half the world!
 */

export interface RawOrderRequest {
  orderId: string;
  userEmail: string;
  items: { productId: string; name: string; unitPrice: number; quantity: number }[];
  promoCode?: string;
  paymentToken: string;
}

export class MonolithicOrderProcessor {
  private db: Database.Database;

  constructor(dbPath: string) {
    // Monolithic setup: Direct DB initialization inside domain logic class
    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS monolithic_orders (
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

  public async processOrder(request: RawOrderRequest): Promise<{ success: boolean; orderId: string; totalPaid: number }> {
    console.log(`\n[MonolithicOrderProcessor] Starting order processing for order #${request.orderId}...`);

    // --- REASON TO CHANGE 1: Validation Logic ---
    if (!request.userEmail || !request.userEmail.includes('@')) {
      throw new Error('[Validation Error] Invalid user email address');
    }
    if (!request.items || request.items.length === 0) {
      throw new Error('[Validation Error] Order must contain at least one item');
    }
    for (const item of request.items) {
      if (item.quantity <= 0 || item.unitPrice < 0) {
        throw new Error(`[Validation Error] Invalid quantity or price for item ${item.name}`);
      }
    }
    if (!request.paymentToken || request.paymentToken.length < 5) {
      throw new Error('[Validation Error] Invalid payment token');
    }

    // --- REASON TO CHANGE 2: Financial & Tax Calculation Logic ---
    let subtotal = 0;
    for (const item of request.items) {
      subtotal += item.unitPrice * item.quantity;
    }

    let discount = 0;
    if (request.promoCode === 'SAVE20') {
      discount = subtotal * 0.20;
    }

    const taxableAmount = subtotal - discount;
    const taxRate = 0.08; // 8% sales tax
    const tax = taxableAmount * taxRate;
    const finalTotal = taxableAmount + tax;

    // --- REASON TO CHANGE 3: Payment Gateway API Calling ---
    console.log(`  [Payment] Charging ${finalTotal.toFixed(2)} USD via Stripe token ${request.paymentToken}...`);
    // Simulated Stripe API call embedded directly inside processOrder
    const paymentSuccessful = true;
    if (!paymentSuccessful) {
      throw new Error('[Payment Error] Payment charge failed');
    }

    // --- REASON TO CHANGE 4: SQL Database Queries & Persistence ---
    console.log(`  [Database] Executing INSERT INTO monolithic_orders...`);
    const stmt = this.db.prepare(`
      INSERT INTO monolithic_orders (id, user_email, subtotal, tax, total, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(request.orderId, request.userEmail, subtotal, tax, finalTotal, 'PAID');

    // --- REASON TO CHANGE 5: Email Formatting & SMTP Delivery ---
    console.log(`  [Notification] Formatting HTML receipt email to ${request.userEmail}...`);
    const htmlEmail = `
      <html>
        <body>
          <h1>Order Confirmation - #${request.orderId}</h1>
          <p>Thank you for your purchase!</p>
          <p>Total Charged: $${finalTotal.toFixed(2)}</p>
        </body>
      </html>
    `;
    // Simulated email dispatch
    console.log(`  [Email Delivered] Transactional email dispatched to SMTP server.`);

    // --- REASON TO CHANGE 6: Telemetry & Metrics Logging ---
    console.log(`  [Metrics] RECORD: order_processed=1, total_revenue=${finalTotal.toFixed(2)}, status=SUCCESS`);

    return {
      success: true,
      orderId: request.orderId,
      totalPaid: finalTotal,
    };
  }

  public close() {
    this.db.close();
  }
}
