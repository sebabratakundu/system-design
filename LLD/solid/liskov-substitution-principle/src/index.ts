import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import {
  RefundBatchProcessorAntiPattern,
  CreditCardPayment,
  PayPalPayment,
  CryptoPayment,
  GiftCardPayment,
  BasePaymentMethod,
} from './0-anti-pattern-lsp-violation.js';
import {
  ProductionRefundBatchProcessor,
  CreditCardProcessor,
  PayPalProcessor,
  GiftCardProcessor,
  CryptoProcessor,
  IRefundablePayable,
} from './1-production-lsp.js';

const DB_PATH_MONOLITHIC = path.join(process.cwd(), 'monolithic_lsp_demo.db');
const DB_PATH_LSP = path.join(process.cwd(), 'production_lsp_demo.db');

function cleanupDatabases() {
  for (const f of [DB_PATH_MONOLITHIC, DB_PATH_LSP]) {
    if (fs.existsSync(f)) {
      try {
        fs.unlinkSync(f);
      } catch (e) {
        // ignore cleanup error
      }
    }
  }
}

async function runLiskovSubstitutionPrincipleDemo() {
  cleanupDatabases();

  console.log('\n===============================================================');
  console.log('🚀 LISKOV SUBSTITUTION PRINCIPLE (LSP) DEMONSTRATION');
  console.log('===============================================================\n');

  // -----------------------------------------------------------------
  // SECTION 1: RUNNING THE LSP VIOLATION ANTI-PATTERN
  // -----------------------------------------------------------------
  console.log('---------------------------------------------------------------');
  console.log('🔴 SECTION 1: LSP CONTRACT VIOLATION (BEHAVIORAL SUBTYPING BREAKAGE)');
  console.log('---------------------------------------------------------------');

  const antiPatternProcessor = new RefundBatchProcessorAntiPattern(DB_PATH_MONOLITHIC);

  const antiPatternBatch: { method: BasePaymentMethod; transactionId: string; amount: number }[] = [
    { method: new CreditCardPayment(), transactionId: 'tx_cc_1001', amount: 150.00 },
    { method: new PayPalPayment(), transactionId: 'tx_pp_1002', amount: 75.50 },
    { method: new CryptoPayment(), transactionId: 'tx_eth_1003', amount: 300.00 }, // 💥 LSP Violation: Throws on refund!
    { method: new GiftCardPayment(), transactionId: 'tx_gc_1004', amount: 120.00 }, // 💥 LSP Violation: Strengthens precondition (> $50)!
  ];

  console.log('⚡ Attempting NAIVE polymorphic execution on batch containing Crypto & GiftCard (> $50)...');
  try {
    await antiPatternProcessor.processBatchNaive(antiPatternBatch);
  } catch (err: any) {
    console.log(`  ❌ CRASHED: ${err.message}`);
    console.log('  💡 WHY: CryptoPayment inherited from BasePaymentMethod but threw an unexpected exception on refund!');
  }

  console.log('\n⚡ Attempting DEFENSIVE execution (using instanceof type checks workaround)...');
  const defensiveCount = await antiPatternProcessor.processBatchDefensive(antiPatternBatch);
  console.log(`  Processed ${defensiveCount} payments using defensive skips.`);
  console.log('  ❌ DRAWBACKS: Client forced to write ugly instanceof type checks, violating LSP & Open-Closed principles!\n');

  antiPatternProcessor.close();

  // -----------------------------------------------------------------
  // SECTION 2: RUNNING PRODUCTION LSP ARCHITECTURE (CLEAN SOLID)
  // -----------------------------------------------------------------
  console.log('---------------------------------------------------------------');
  console.log('🟢 SECTION 2: PRODUCTION LSP ARCHITECTURE (BEHAVIORAL SUBSTITUTABILITY)');
  console.log('---------------------------------------------------------------');

  const lspDb = new Database(DB_PATH_LSP);
  const productionProcessor = new ProductionRefundBatchProcessor(lspDb);

  // Notice: CryptoProcessor cannot even be put into this batch because it implements IPayable, NOT IRefundablePayable!
  // TypeScript compiler prevents type errors at compile time!
  const productionBatch: { processor: IRefundablePayable; transactionId: string; amount: number }[] = [
    { processor: new CreditCardProcessor(), transactionId: 'tx_cc_2001', amount: 150.00 },
    { processor: new PayPalProcessor(), transactionId: 'tx_pp_2002', amount: 75.50 },
    { processor: new GiftCardProcessor(), transactionId: 'tx_gc_2003', amount: 120.00 },
  ];

  const processedCount = await productionProcessor.processBatch(productionBatch);
  console.log(`\n  ✅ Production LSP Result: Successfully processed ${processedCount} / ${productionBatch.length} refunds with 100% substitutability!`);
  console.log('  ✅ ADVANTAGES: Zero instanceof checks, zero unexpected runtime crashes, compile-time capability segregation!\n');

  lspDb.close();

  // -----------------------------------------------------------------
  // ARCHITECTURAL COMPARISON SUMMARY
  // -----------------------------------------------------------------
  console.log('===============================================================');
  console.log('📊 ARCHITECTURAL COMPARISON TABLE');
  console.log('===============================================================');

  console.table([
    {
      Metric: 'Subtype Substitutability',
      'LSP Violation Anti-Pattern': '❌ Broken (Crypto subclass throws runtime error on base method)',
      'Production LSP Architecture': '✅ 100% Guaranteed (All subtypes honor interface contract)',
    },
    {
      Metric: 'Precondition Rules',
      'LSP Violation Anti-Pattern': '❌ Strengthened in subclass (GiftCard restricts refund > $50)',
      'Production LSP Architecture': '✅ Preserved (Subtypes honor base preconditions)',
    },
    {
      Metric: 'Client Code Complexity',
      'LSP Violation Anti-Pattern': 'High (Requires defensive instanceof type checks)',
      'Production LSP Architecture': 'Low (Pure polymorphism with zero type checks)',
    },
    {
      Metric: 'Compile-Time Safety',
      'LSP Violation Anti-Pattern': 'Low (Runtime crashes when non-refundable subtypes passed)',
      'Production LSP Architecture': 'High (Interface segregation prevents invalid objects at compile time)',
    },
    {
      Metric: 'Behavioral Contract',
      'LSP Violation Anti-Pattern': 'Violated by subclass method overrides',
      'Production LSP Architecture': 'Strictly enforced via role interfaces',
    },
  ]);

  cleanupDatabases();
}

runLiskovSubstitutionPrincipleDemo().catch((err) => {
  console.error('❌ Error executing LSP demo:', err);
  process.exit(1);
});
