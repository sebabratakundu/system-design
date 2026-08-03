import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { MonolithicPaymentProcessor, PaymentRequest } from './0-anti-pattern-if-else-cascade.js';
import {
  OcpPaymentProcessor,
  PaymentStrategyRegistry,
  CreditCardStrategy,
  PayPalStrategy,
  CryptoStrategy,
  KlarnaStrategy,
  PaymentPayload,
} from './1-production-ocp.js';

const DB_PATH_MONOLITHIC = path.join(process.cwd(), 'monolithic_ocp_demo.db');
const DB_PATH_OCP = path.join(process.cwd(), 'production_ocp_demo.db');

function cleanupDatabases() {
  for (const f of [DB_PATH_MONOLITHIC, DB_PATH_OCP]) {
    if (fs.existsSync(f)) {
      try {
        fs.unlinkSync(f);
      } catch (e) {
        // ignore cleanup error
      }
    }
  }
}

async function runOpenClosedPrincipleDemo() {
  cleanupDatabases();

  console.log('\n===============================================================');
  console.log('🚀 OPEN-CLOSED PRINCIPLE (OCP) DEMONSTRATION');
  console.log('===============================================================\n');

  // Sample Payment Payloads
  const ccPayment: PaymentPayload = {
    orderId: 'ord_1001',
    amount: 149.99,
    currency: 'USD',
    paymentMethod: 'CREDIT_CARD',
    details: { cardNumber: '4111111111111111', cvv: '123' },
  };

  const paypalPayment: PaymentPayload = {
    orderId: 'ord_1002',
    amount: 89.50,
    currency: 'USD',
    paymentMethod: 'PAYPAL',
    details: { paypalEmail: 'buyer@example.com' },
  };

  const cryptoPayment: PaymentPayload = {
    orderId: 'ord_1003',
    amount: 450.00,
    currency: 'USD',
    paymentMethod: 'CRYPTO',
    details: { walletAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F' },
  };

  const klarnaPayment: PaymentPayload = {
    orderId: 'ord_1004',
    amount: 299.00,
    currency: 'USD',
    paymentMethod: 'KLARNA',
    details: { installmentPlanMonths: 4, ssnLast4: '8812' },
  };

  // -----------------------------------------------------------------
  // SECTION 1: MONOLITHIC SWITCH/IF-ELSE CASCADE (OCP VIOLATION)
  // -----------------------------------------------------------------
  console.log('---------------------------------------------------------------');
  console.log('🔴 SECTION 1: MONOLITHIC SWITCH CASCADE (OCP VIOLATION)');
  console.log('---------------------------------------------------------------');

  const monoProcessor = new MonolithicPaymentProcessor(DB_PATH_MONOLITHIC);

  // Process standard methods
  await monoProcessor.processPayment(ccPayment as PaymentRequest);
  await monoProcessor.processPayment(paypalPayment as PaymentRequest);
  await monoProcessor.processPayment(cryptoPayment as PaymentRequest);

  console.log('\n⚡ Attempting to process NEW payment method "KLARNA" on Monolithic Processor...');
  try {
    await monoProcessor.processPayment(klarnaPayment as PaymentRequest);
  } catch (err: any) {
    console.log(`  ❌ FAILED: ${err.message}`);
    console.log('  💡 WHY: Monolithic processor MUST BE MODIFIED by opening and editing the switch statement!');
  }
  monoProcessor.close();

  // -----------------------------------------------------------------
  // SECTION 2: PRODUCTION OCP STRATEGY ARCHITECTURE (CLEAN SOLID)
  // -----------------------------------------------------------------
  console.log('\n---------------------------------------------------------------');
  console.log('🟢 SECTION 2: PRODUCTION OCP STRATEGY ARCHITECTURE (CLEAN SOLID)');
  console.log('---------------------------------------------------------------');

  // 1. Initialize Strategy Registry
  const registry = new PaymentStrategyRegistry();

  // 2. Register Existing Core Strategies
  registry.register(new CreditCardStrategy());
  registry.register(new PayPalStrategy());
  registry.register(new CryptoStrategy());

  // 3. Instantiate Core OCP Processor
  const ocpDb = new Database(DB_PATH_OCP);
  const ocpProcessor = new OcpPaymentProcessor(registry, ocpDb);

  // Process core payment methods
  await ocpProcessor.process(ccPayment);
  await ocpProcessor.process(paypalPayment);

  console.log('\n🔌 EXTENDING SYSTEM WITH NEW FEATURE ("KLARNA") WITHOUT MODIFYING EXISTING CODE...');
  // 🟢 OCP IN ACTION: We create KlarnaStrategy class and register it. ZERO core code edited!
  registry.register(new KlarnaStrategy());

  // Process Klarna payment seamlessly
  const klarnaRes = await ocpProcessor.process(klarnaPayment);
  console.log(`  ✅ SUCCESS: Klarna Payment processed! TxID=[${klarnaRes.transactionId}] via [${klarnaRes.providerName}]`);

  ocpDb.close();

  // -----------------------------------------------------------------
  // ARCHITECTURAL COMPARISON SUMMARY
  // -----------------------------------------------------------------
  console.log('\n===============================================================');
  console.log('📊 ARCHITECTURAL COMPARISON TABLE');
  console.log('===============================================================');

  console.table([
    {
      Metric: 'Adding New Feature (e.g. Klarna)',
      'Monolithic Switch Cascade': 'Requires editing & re-compiling existing file',
      'Production OCP Strategy Architecture': 'Purely additive: Create 1 new strategy class',
    },
    {
      Metric: 'Closed for Modification',
      'Monolithic Switch Cascade': '❌ NO (Core process method edited repeatedly)',
      'Production OCP Strategy Architecture': '✅ YES (Core processor never edited)',
    },
    {
      Metric: 'Risk of Regression',
      'Monolithic Switch Cascade': 'High (Editing switch can break CreditCard)',
      'Production OCP Strategy Architecture': 'Zero (Existing strategies are untouched)',
    },
    {
      Metric: 'Code Cohesion',
      'Monolithic Switch Cascade': 'Low (All vendor logic mixed in 1 function)',
      'Production OCP Strategy Architecture': 'High (Each strategy owns its vendor logic)',
    },
    {
      Metric: 'Unit Testing Strategy',
      'Monolithic Switch Cascade': 'Must test entire 300-line processor file',
      'Production OCP Strategy Architecture': 'Test single strategy class in 5 lines of code',
    },
  ]);

  cleanupDatabases();
}

runOpenClosedPrincipleDemo().catch((err) => {
  console.error('❌ Error executing OCP demo:', err);
  process.exit(1);
});
