import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { MonolithicOrderProcessor, RawOrderRequest } from './0-anti-pattern-god-class.js';
import {
  OrderCheckoutOrchestrator,
  OrderValidator,
  TaxAndDiscountCalculator,
  SqlOrderRepository,
  StripePaymentProcessor,
  ResendEmailNotifier,
  MetricsTelemetryLogger,
  CheckoutRequest,
} from './1-production-srp.js';

const DB_PATH_MONOLITHIC = path.join(process.cwd(), 'monolithic_demo.db');
const DB_PATH_SRP = path.join(process.cwd(), 'srp_demo.db');

function cleanupDatabases() {
  for (const f of [DB_PATH_MONOLITHIC, DB_PATH_SRP]) {
    if (fs.existsSync(f)) {
      try {
        fs.unlinkSync(f);
      } catch (e) {
        // ignore cleanup error
      }
    }
  }
}

async function runSingleResponsibilityPrincipleDemo() {
  cleanupDatabases();

  console.log('\n===============================================================');
  console.log('🚀 SINGLE RESPONSIBILITY PRINCIPLE (SRP) DEMONSTRATION');
  console.log('===============================================================\n');

  // Sample Order Request Data
  const sampleOrder: CheckoutRequest = {
    orderId: 'ord_9901',
    userEmail: 'alex.engineer@example.com',
    items: [
      { productId: 'prod_macbook', name: 'Apple MacBook Pro M3', unitPrice: 1999.0, quantity: 1 },
      { productId: 'prod_adapter', name: 'USB-C Multi-Port Adapter', unitPrice: 49.0, quantity: 2 },
    ],
    promoCode: 'SAVE20',
    paymentToken: 'tok_visa_valid_99001',
  };

  // -----------------------------------------------------------------
  // SECTION 1: RUNNING THE MONOLITHIC GOD CLASS (SRP VIOLATION)
  // -----------------------------------------------------------------
  console.log('---------------------------------------------------------------');
  console.log('🔴 SECTION 1: MONOLITHIC GOD CLASS (SRP VIOLATION)');
  console.log('---------------------------------------------------------------');

  const monolithicProcessor = new MonolithicOrderProcessor(DB_PATH_MONOLITHIC);
  const monoStart = performance.now();
  const monoResult = await monolithicProcessor.processOrder(sampleOrder as RawOrderRequest);
  const monoDuration = performance.now() - monoStart;
  monolithicProcessor.close();

  console.log(`\n  Monolithic Processing Result: Success=${monoResult.success}, Total Paid: $${monoResult.totalPaid.toFixed(2)} (${monoDuration.toFixed(2)}ms)`);
  console.log('  ❌ DRAWBACKS: 6 reasons to change, tight coupling, impossible unit testing without DB setup!\n');

  // -----------------------------------------------------------------
  // SECTION 2: RUNNING PRODUCTION SRP ARCHITECTURE (CLEAN SOLID)
  // -----------------------------------------------------------------
  console.log('---------------------------------------------------------------');
  console.log('🟢 SECTION 2: PRODUCTION SRP ARCHITECTURE (CLEAN SOLID)');
  console.log('---------------------------------------------------------------');

  const srpDb = new Database(DB_PATH_SRP);
  
  // Single-Responsibility Component Instantiations (Dependency Injection)
  const validator = new OrderValidator();
  const pricingCalculator = new TaxAndDiscountCalculator(0.08); // 8% sales tax
  const orderRepository = new SqlOrderRepository(srpDb);
  const paymentProcessor = new StripePaymentProcessor();
  const notificationService = new ResendEmailNotifier();
  const telemetryLogger = new MetricsTelemetryLogger();

  // Orchestrator receives single-responsibility dependencies
  const orchestrator = new OrderCheckoutOrchestrator(
    validator,
    pricingCalculator,
    orderRepository,
    paymentProcessor,
    notificationService,
    telemetryLogger
  );

  const srpStart = performance.now();
  const srpResult = await orchestrator.checkout(sampleOrder);
  const srpDuration = performance.now() - srpStart;
  srpDb.close();

  console.log(`\n  Production SRP Result: Success=${srpResult.success}, Total Paid: $${srpResult.totalPaid.toFixed(2)} (${srpDuration.toFixed(2)}ms)`);
  console.log('  ✅ ADVANTAGES: Each class has 1 reason to change, 100% unit-testable with isolated mocks, zero side effects!\n');

  // -----------------------------------------------------------------
  // ARCHITECTURAL COMPARISON SUMMARY
  // -----------------------------------------------------------------
  console.log('===============================================================');
  console.log('📊 ARCHITECTURAL COMPARISON TABLE');
  console.log('===============================================================');

  console.table([
    {
      Metric: 'Reasons to Change',
      'Monolithic God Class': '6 (Validation, Pricing, DB, Payment, Email, Metrics)',
      'Production SRP Architecture': '1 per class (Single Concern)',
    },
    {
      Metric: 'Cohesion',
      'Monolithic God Class': 'Low (Mixed concerns in one giant method)',
      'Production SRP Architecture': 'High (Focused, single-purpose modules)',
    },
    {
      Metric: 'Coupling',
      'Monolithic God Class': 'Tight (Direct SQLite & hardcoded logic)',
      'Production SRP Architecture': 'Loose (Decoupled interfaces via DI)',
    },
    {
      Metric: 'Unit Testability',
      'Monolithic God Class': 'Difficult (Requires DB & external mocks)',
      'Production SRP Architecture': 'Extremely Easy (Test each class in isolation)',
    },
    {
      Metric: 'Risk of Regression',
      'Monolithic God Class': 'High (Changing emails risks breaking DB)',
      'Production SRP Architecture': 'Zero (Changes isolated to 1 module)',
    },
  ]);

  cleanupDatabases();
}

runSingleResponsibilityPrincipleDemo().catch((err) => {
  console.error('❌ Error executing SRP demo:', err);
  process.exit(1);
});
