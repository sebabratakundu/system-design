import { ProductionOrderDB } from './db.js';
import { ProductionOrderOrchestrator } from './orchestrator.js';

async function main() {
  console.log('================================================================');
  console.log('PRODUCTION PATTERN 1: DB State Machine, Locks & Poller Recovery');
  console.log('================================================================');

  const db = new ProductionOrderDB();
  await db.initSchema();
  const orchestrator = new ProductionOrderOrchestrator(db);

  // Run Scenario A: Successful Order
  console.log('\n--- Scenario A: Happy Path Execution ---');
  await db.createOrder({ id: 'ORD-PROD-101', userId: 'usr_alpha', amount: 299, items: [{ sku: 'MACBOOK', qty: 1 }] });
  await orchestrator.processOrder('ORD-PROD-101', 'worker-node-1');

  // Run Scenario B: Out-of-Stock Inventory Failure -> Saga Compensation
  console.log('\n--- Scenario B: Non-Transient Inventory Error -> Saga Rollback ---');
  await db.createOrder({ id: 'ORD-PROD-102', userId: 'usr_beta', amount: 49, items: [{ sku: 'AIRPODS', qty: 1 }] });
  await orchestrator.processOrder('ORD-PROD-102', 'worker-node-1', { forceInventoryFail: true });

  // Run Scenario C: Server Crash After Payment -> Poller Recovery
  console.log('\n--- Scenario C: Process Crash Mid-Way & Poller Crash Recovery ---');
  await db.createOrder({ id: 'ORD-PROD-103', userId: 'usr_gamma', amount: 899, items: [{ sku: 'DISPLAY', qty: 1 }] });
  await orchestrator.processOrder('ORD-PROD-103', 'worker-node-1', { simulateCrashAfterPayment: true });

  console.log('\n--> Waiting 1.8s for worker-node-1 DB lock expiration...');
  await new Promise((r) => setTimeout(r, 1800));

  // Background Poller on Worker-Node-2 claims lock and resumes execution safely
  await orchestrator.runBackgroundPoller('poller-worker-node-2');

  console.log('\n--- Production Database Records Summary ---');
  console.table(
    db.getAll().map((o) => ({
      id: o.id,
      state: o.state,
      version: o.version,
      paymentId: o.paymentId || 'N/A',
      shippingLabelId: o.shippingLabelId || 'N/A',
    }))
  );
}

main().catch(console.error);
