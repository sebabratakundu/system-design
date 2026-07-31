import { TemporalRunner } from "./temporalEngineSim.js";
import {
  orderFulfillmentWorkflow,
  warehousePickupSignal,
  getOrderStatusQuery,
  upgradeToExpressShippingUpdate,
} from "./workflow.js";

async function main() {
  console.log("================================================================");
  console.log("PRODUCTION PATTERN 3: Durable Execution Engine (Temporal SDK)");
  console.log("================================================================");

  const runner = new TemporalRunner();
  await runner.start();

  try {
    // Scenario A: Happy Path Workflow, Child Workflow Execution & Heartbeating
    console.log("\n--- Scenario A: Start Parent & Child Workflows + Heartbeating Activity ---");
    const handle1 = await runner.client.workflow.start(orderFulfillmentWorkflow, {
      taskQueue: "order-fulfillment-queue",
      workflowId: "wf_ord_prod_301",
      args: [
        { orderId: "ORD-PROD-301", amount: 550, customerId: "cust_delta" },
      ],
    });

    // Query workflow mid-flight status
    await new Promise((resolve) => setTimeout(resolve, 300));
    const statusQuery = await handle1.query(getOrderStatusQuery);
    console.log("📊 [Temporal Query] Mid-Flight Status Query Result:", statusQuery);

    // Deliver Human Warehouse Pickup Signal to unlock pending step
    console.log("\n--- Scenario B: Deliver Human Warehouse Pickup Signal ---");
    await handle1.signal(warehousePickupSignal, {
      workerId: "warehouse_scanner_42",
    });

    const result1 = await handle1.result();
    console.log("✅ [Temporal Workflow Handle] Scenario A Final Result:", result1);

    // Scenario C: Synchronous Atomic Workflow Update Mid-Flight
    console.log("\n--- Scenario C: Synchronous Atomic Workflow Update (Express Upgrade) ---");
    const handleUpdate = await runner.client.workflow.start(orderFulfillmentWorkflow, {
      taskQueue: "order-fulfillment-queue",
      workflowId: "wf_ord_prod_302_update",
      args: [
        { orderId: "ORD-PROD-302", amount: 1200, customerId: "cust_vip" },
      ],
    });

    await new Promise((resolve) => setTimeout(resolve, 400));
    // Atomic Synchronous Update call
    const updateResult = await handleUpdate.executeUpdate(upgradeToExpressShippingUpdate, {
      args: [{ expressCarrier: "DHL_EXPRESS_SAME_DAY" }],
    });
    console.log("⚡ [Temporal Client] Update Call Returned Response:", updateResult);

    await handleUpdate.signal(warehousePickupSignal, { workerId: "express_hub_01" });
    const resultUpdate = await handleUpdate.result();
    console.log("✅ [Temporal Workflow Handle] Scenario C Update Workflow Result:", resultUpdate);

    // Scenario D: Non-Retryable Application Failure (Card Expired - Fails Instantly)
    console.log("\n--- Scenario D: Non-Retryable Application Failure (CARD_EXPIRED) ---");
    const handleNonRetryable = await runner.client.workflow.start(orderFulfillmentWorkflow, {
      taskQueue: "order-fulfillment-queue",
      workflowId: "wf_ord_prod_303_card_expired",
      args: [
        {
          orderId: "ORD-PROD-303",
          amount: 80,
          customerId: "cust_expired",
          forceFailPaymentExpired: true,
        },
      ],
    });

    const resultD = await handleNonRetryable.result();
    console.log("⚠️ [Temporal Workflow Handle] Scenario D Result (Skipped Retries):", resultD);

    // Scenario E: Child Workflow Fraud Assessment Rejection -> Saga Rollback
    console.log("\n--- Scenario E: Child Workflow Fraud Failure -> Automated Compensation ---");
    const handleChildFail = await runner.client.workflow.start(orderFulfillmentWorkflow, {
      taskQueue: "order-fulfillment-queue",
      workflowId: "wf_ord_prod_304_fraud_child",
      args: [
        {
          orderId: "ORD-PROD-304",
          amount: 9500,
          customerId: "blacklisted_user",
          forceFailFraud: true,
        },
      ],
    });

    const resultE = await handleChildFail.result();
    console.log("⚠️ [Temporal Workflow Handle] Scenario E Result (Child Fraud Reject):", resultE);

  } finally {
    await runner.shutdown();
  }
}

main().catch(console.error);
