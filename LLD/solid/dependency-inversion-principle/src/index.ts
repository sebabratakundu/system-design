import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import {
  OrderCheckoutManagerAntiPattern,
  OrderPayload,
} from "./0-anti-pattern-hardcoded-dependencies.js";
import {
  OrderCheckoutService,
  SqliteOrderRepository,
  StripePaymentGateway,
  ResendEmailNotifier,
  InMemoryOrderRepository,
  MockPaymentGateway,
  MockEmailNotifier,
  OrderData,
} from "./1-production-dip.js";

const DB_PATH_MONOLITHIC = path.join(process.cwd(), "monolithic_dip_demo.db");
const DB_PATH_DIP = path.join(process.cwd(), "production_dip_demo.db");

function cleanupDatabases() {
  for (const f of [DB_PATH_MONOLITHIC, DB_PATH_DIP]) {
    if (fs.existsSync(f)) {
      try {
        fs.unlinkSync(f);
      } catch (e) {
        // ignore cleanup error
      }
    }
  }
}

async function runDependencyInversionPrincipleDemo() {
  cleanupDatabases();

  console.log(
    "\n===============================================================",
  );
  console.log("🚀 DEPENDENCY INVERSION PRINCIPLE (DIP) DEMONSTRATION");
  console.log(
    "===============================================================\n",
  );

  const sampleOrder: OrderPayload = {
    orderId: "ord_7701",
    customerEmail: "dev.lead@example.com",
    amount: 199.99,
    stripeToken: "tok_visa_valid",
  };

  const sampleOrder2: OrderData = {
    orderId: "ord_7701",
    customerEmail: "dev.lead@example.com",
    amount: 199.99,
    paymentToken: "tok_visa_valid",
  };

  // -----------------------------------------------------------------
  // SECTION 1: HARDCODED DEPENDENCIES ANTI-PATTERN (DIP VIOLATION)
  // -----------------------------------------------------------------
  console.log(
    "---------------------------------------------------------------",
  );
  console.log("🔴 SECTION 1: HARDCODED CONCRETE DEPENDENCIES (DIP VIOLATION)");
  console.log(
    "---------------------------------------------------------------",
  );

  const monolithicManager = new OrderCheckoutManagerAntiPattern(
    DB_PATH_MONOLITHIC,
  );
  const monoStart = performance.now();
  await monolithicManager.checkout(sampleOrder);
  const monoDuration = performance.now() - monoStart;
  monolithicManager.close();

  console.log(
    `\n  Monolithic Checkout Completed in ${monoDuration.toFixed(2)}ms`,
  );
  console.log(
    "  ❌ DRAWBACKS: High-level business logic is hardcoded to SQLite/Stripe/SendGrid. Impossible to test offline without DB/network!\n",
  );

  // -----------------------------------------------------------------
  // SECTION 2A: PRODUCTION DIP IN PRODUCTION MODE (REAL DRIVERS)
  // -----------------------------------------------------------------
  console.log(
    "---------------------------------------------------------------",
  );
  console.log("🟢 SECTION 2A: PRODUCTION DIP (PRODUCTION MODE - REAL DRIVERS)");
  console.log(
    "---------------------------------------------------------------",
  );

  const dipDb = new Database(DB_PATH_DIP);

  // Instantiating real production implementations of abstractions
  const prodRepo = new SqliteOrderRepository(dipDb);
  const prodGateway = new StripePaymentGateway();
  const prodMailer = new ResendEmailNotifier();

  // Injecting production dependencies into high-level business service
  const prodCheckoutService = new OrderCheckoutService(
    prodRepo,
    prodGateway,
    prodMailer,
  );

  const prodStart = performance.now();
  const prodResult = await prodCheckoutService.processCheckout(sampleOrder2);
  const prodDuration = performance.now() - prodStart;
  dipDb.close();

  console.log(
    `\n  Production DIP Result: Success=${prodResult.success}, ChargeId=[${prodResult.chargeId}] (${prodDuration.toFixed(2)}ms)`,
  );

  // -----------------------------------------------------------------
  // SECTION 2B: PRODUCTION DIP IN UNIT TEST MODE (MOCK DRIVERS)
  // -----------------------------------------------------------------
  console.log(
    "\n---------------------------------------------------------------",
  );
  console.log(
    "🟢 SECTION 2B: PRODUCTION DIP (UNIT TEST MODE - ZERO I/O MOCKS)",
  );
  console.log(
    "---------------------------------------------------------------",
  );

  // Instantiating in-memory test doubles implementing the SAME abstractions
  const mockRepo = new InMemoryOrderRepository();
  const mockGateway = new MockPaymentGateway();
  const mockMailer = new MockEmailNotifier();

  // High-level service accepts test doubles seamlessly! ZERO lines of business code changed!
  const testCheckoutService = new OrderCheckoutService(
    mockRepo,
    mockGateway,
    mockMailer,
  );

  const testStart = performance.now();
  const testResult = await testCheckoutService.processCheckout(sampleOrder2);
  const testDuration = performance.now() - testStart;

  console.log(
    `\n  Unit Test DIP Result: Success=${testResult.success}, ChargeId=[${testResult.chargeId}] (${testDuration.toFixed(2)}ms)`,
  );
  console.log(
    `  ✅ Verified In-Memory State: Saved Orders Count = ${mockRepo.savedOrders.size}`,
  );
  console.log(
    `  ✅ Verified Email Buffer: Sent Emails Count = ${mockMailer.sentMessages.length}`,
  );
  console.log(
    "  ✅ ADVANTAGES: High-level business rules tested in 0.1ms offline with 100% test isolation!\n",
  );

  // -----------------------------------------------------------------
  // ARCHITECTURAL COMPARISON SUMMARY
  // -----------------------------------------------------------------
  console.log(
    "===============================================================",
  );
  console.log("📊 ARCHITECTURAL COMPARISON TABLE");
  console.log(
    "===============================================================",
  );

  console.table([
    {
      Metric: "Dependency Direction",
      "Hardcoded Dependencies Anti-Pattern":
        "High-level business code depends on low-level libraries",
      "Production DIP Architecture":
        "Both high-level and low-level depend on abstractions",
    },
    {
      Metric: "Inversion of Control (IoC)",
      "Hardcoded Dependencies Anti-Pattern":
        "❌ NO (Business module instantiates drivers inside constructor)",
      "Production DIP Architecture":
        "✅ YES (Dependencies injected externally via DI)",
    },
    {
      Metric: "Unit Testing Speed & Ease",
      "Hardcoded Dependencies Anti-Pattern":
        "Slow & Fragile (Requires real DB files & active APIs)",
      "Production DIP Architecture":
        "Lightning Fast (1ms unit tests with in-memory mocks)",
    },
    {
      Metric: "Infrastructure Pluggability",
      "Hardcoded Dependencies Anti-Pattern":
        "Rigid (Swapping DB/Email requires editing business logic)",
      "Production DIP Architecture":
        "Extremely Flexible (Swap SQLite -> Postgres in 1 line of config)",
    },
    {
      Metric: "Code Coupling",
      "Hardcoded Dependencies Anti-Pattern":
        "Tight (Coupled to concrete SQL queries & HTTP APIs)",
      "Production DIP Architecture":
        "Loose (Coupled strictly to domain interfaces)",
    },
  ]);

  cleanupDatabases();
}

runDependencyInversionPrincipleDemo().catch((err) => {
  console.error("❌ Error executing DIP demo:", err);
  process.exit(1);
});
