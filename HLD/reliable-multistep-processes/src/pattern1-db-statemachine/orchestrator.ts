import { ProductionOrderDB, OrderRecord } from './db.js';
import { ProductionPaymentGateway, ProductionInventoryService, ProductionShippingAPI } from './services.js';

export class ProductionOrderOrchestrator {
  constructor(private db: ProductionOrderDB) {}

  async processOrder(
    orderId: string,
    workerId: string,
    options?: { forceInventoryFail?: boolean; simulateCrashAfterPayment?: boolean }
  ): Promise<void> {
    const lockDurationMs = 1500; // 1.5 seconds lock window
    let currentOrder = await this.db.claimLock(orderId, workerId, lockDurationMs);

    if (!currentOrder) {
      console.log(`[Orchestrator:${workerId}] Skipped order ${orderId}: Lock active by another worker.`);
      return;
    }

    console.log(`\n[Orchestrator:${workerId}] Processing ${orderId} | State: ${currentOrder.state} | Version: ${currentOrder.version}`);

    try {
      // Step 1: Charge Payment
      if (currentOrder.state === 'PENDING') {
        const payment = await ProductionPaymentGateway.charge({
          idempotencyKey: `idemp_pay_${currentOrder.id}`,
          amount: currentOrder.amount,
          orderId: currentOrder.id,
        });

        currentOrder = await this.db.updateState(currentOrder.id, currentOrder.version, 'PAYMENT_CHARGED', {
          paymentId: payment.id,
        });

        if (options?.simulateCrashAfterPayment) {
          console.log(`💥 [Orchestrator:${workerId}] SERVER CRASH SIMULATION! Process terminated right after state checkpoint.`);
          return; // Process dies without releasing lock; lock expires automatically
        }
      }

      // Step 2: Reserve Inventory
      if (currentOrder.state === 'PAYMENT_CHARGED') {
        try {
          await ProductionInventoryService.reserve({
            idempotencyKey: `idemp_inv_${currentOrder.id}`,
            items: currentOrder.items,
            forceFail: options?.forceInventoryFail,
          });

          currentOrder = await this.db.updateState(currentOrder.id, currentOrder.version, 'INVENTORY_RESERVED');
        } catch (err: any) {
          console.log(`❌ [Orchestrator:${workerId}] Step 2 Failed (${err.message}). Transitioning to ROLLBACK_PAYMENT...`);
          currentOrder = await this.db.updateState(currentOrder.id, currentOrder.version, 'ROLLBACK_PAYMENT');
        }
      }

      // Step 3: Create Shipping Label
      if (currentOrder.state === 'INVENTORY_RESERVED') {
        try {
          const shipping = await ProductionShippingAPI.createLabel({
            idempotencyKey: `idemp_ship_${currentOrder.id}`,
            orderId: currentOrder.id,
          });

          currentOrder = await this.db.updateState(currentOrder.id, currentOrder.version, 'SHIPPING_LABEL_CREATED', {
            shippingLabelId: shipping.id,
          });
          currentOrder = await this.db.updateState(currentOrder.id, currentOrder.version, 'WAITING_FOR_PICKUP');
        } catch (err) {
          currentOrder = await this.db.updateState(currentOrder.id, currentOrder.version, 'ROLLBACK_INVENTORY');
        }
      }

      // Step 4: Final Fulfillment Check
      if (currentOrder.state === 'WAITING_FOR_PICKUP') {
        currentOrder = await this.db.updateState(currentOrder.id, currentOrder.version, 'FULFILLED');
        console.log(`✅ [Orchestrator:${workerId}] Order ${currentOrder.id} successfully FULFILLED!`);
      }

      // --- SAGA COMPENSATIONS ---
      if (currentOrder.state === 'ROLLBACK_INVENTORY') {
        await ProductionInventoryService.release({
          idempotencyKey: `idemp_rel_${currentOrder.id}`,
          items: currentOrder.items,
        });
        currentOrder = await this.db.updateState(currentOrder.id, currentOrder.version, 'ROLLBACK_PAYMENT');
      }

      if (currentOrder.state === 'ROLLBACK_PAYMENT') {
        if (currentOrder.paymentId) {
          await ProductionPaymentGateway.refund({
            idempotencyKey: `idemp_ref_${currentOrder.id}`,
            paymentId: currentOrder.paymentId,
          });
        }
        currentOrder = await this.db.updateState(currentOrder.id, currentOrder.version, 'FAILED_UNRECOVERABLE');
        console.log(`⛔ [Orchestrator:${workerId}] Order ${currentOrder.id} state finalized as FAILED_UNRECOVERABLE.`);
      }
    } finally {
      await this.db.releaseLock(orderId, workerId);
    }
  }

  async runBackgroundPoller(workerId: string): Promise<number> {
    const stuck = await this.db.findStuckOrders();
    console.log(`\n🔍 [Poller:${workerId}] Scanning database... Found ${stuck.length} stuck order(s) needing recovery.`);
    for (const order of stuck) {
      await this.processOrder(order.id, workerId);
    }
    return stuck.length;
  }
}
