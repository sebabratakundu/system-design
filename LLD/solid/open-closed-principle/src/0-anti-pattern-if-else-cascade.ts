import Database from 'better-sqlite3';

/**
 * OCP ANTI-PATTERN: Monolithic Switch/If-Else Cascade (MonolithicPaymentProcessor)
 * 
 * 🔴 WHY THIS VIOLATES THE OPEN-CLOSED PRINCIPLE (OCP):
 * 1. NOT CLOSED FOR MODIFICATION: Every time the business supports a new payment method
 *    (e.g., Apple Pay, Crypto, Klarna, UPI), developers MUST open and modify this class.
 * 2. REGRESSION RISK: Modifying existing logic inside the switch-case cascade risks
 *    breaking previously tested payment types (e.g. breaking Credit Card handling while adding Klarna).
 * 3. BLOWN OUT CONDITIONAL LOGIC: The processPayment method grows continuously, becoming unmaintainable.
 * 4. POOR COHESION: Different payment vendor API setups are all mixed in a single monolithic method.
 */

export interface PaymentRequest {
  orderId: string;
  amount: number;
  currency: string;
  paymentMethod: string; // 'CREDIT_CARD' | 'PAYPAL' | 'CRYPTO' | 'APPLE_PAY'
  details: {
    cardNumber?: string;
    paypalEmail?: string;
    walletAddress?: string;
    applePayToken?: string;
  };
}

export interface PaymentResponse {
  success: boolean;
  transactionId: string;
  provider: string;
  amountPaid: number;
  timestamp: string;
}

export class MonolithicPaymentProcessor {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS monolithic_payments (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        amount REAL NOT NULL,
        method TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  public async processPayment(request: PaymentRequest): Promise<PaymentResponse> {
    console.log(`\n[MonolithicPaymentProcessor] Processing ${request.paymentMethod} payment for Order #${request.orderId}...`);

    let transactionId = '';
    let providerName = '';

    // 🔴 OCP VIOLATION: Massive Switch Cascade!
    // Adding a new payment method requires modifying this switch statement.
    switch (request.paymentMethod.toUpperCase()) {
      case 'CREDIT_CARD':
        if (!request.details.cardNumber || request.details.cardNumber.length < 13) {
          throw new Error('[CreditCard Error] Invalid credit card number');
        }
        console.log(`  [CreditCard Provider] Authorizing card ${request.details.cardNumber.slice(-4)} for $${request.amount}...`);
        transactionId = `tx_cc_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        providerName = 'Stripe Credit Card';
        break;

      case 'PAYPAL':
        if (!request.details.paypalEmail || !request.details.paypalEmail.includes('@')) {
          throw new Error('[PayPal Error] Invalid PayPal email address');
        }
        console.log(`  [PayPal Provider] Executing PayPal OAuth checkout for ${request.details.paypalEmail}...`);
        transactionId = `tx_pp_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        providerName = 'PayPal Express';
        break;

      case 'CRYPTO':
        if (!request.details.walletAddress || !request.details.walletAddress.startsWith('0x')) {
          throw new Error('[Crypto Error] Invalid Web3 wallet address');
        }
        console.log(`  [Crypto Provider] Verifying on-chain transaction for wallet ${request.details.walletAddress}...`);
        transactionId = `tx_eth_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        providerName = 'Ethereum Web3 Gateway';
        break;

      case 'APPLE_PAY':
        if (!request.details.applePayToken) {
          throw new Error('[ApplePay Error] Missing Apple Pay encrypted token');
        }
        console.log(`  [ApplePay Provider] Decrypting Secure Enclave token for $${request.amount}...`);
        transactionId = `tx_ap_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        providerName = 'Apple Pay Direct';
        break;

      default:
        // When business wants to add 'KLARNA' or 'UPI', code execution fails here until this file is MODIFIED!
        throw new Error(`[OCP Violation Error] Unsupported payment method: ${request.paymentMethod}`);
    }

    // Persist Payment Record
    const stmt = this.db.prepare(`
      INSERT INTO monolithic_payments (id, order_id, amount, method, status)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(transactionId, request.orderId, request.amount, request.paymentMethod, 'SUCCESS');

    return {
      success: true,
      transactionId,
      provider: providerName,
      amountPaid: request.amount,
      timestamp: new Date().toISOString(),
    };
  }

  public close() {
    this.db.close();
  }
}
