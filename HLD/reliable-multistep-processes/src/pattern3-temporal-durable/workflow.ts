import {
  proxyActivities,
  defineSignal,
  defineQuery,
  defineUpdate,
  setHandler,
  condition,
  patched,
  executeChild,
  CancellationScope,
} from "@temporalio/workflow";
import type * as activities from "./activities.js";
import type { OrderInput, ShippingResult, RiskAssessmentResult } from "./activities.js";

const {
  evaluateRiskAndFraud,
  processPayment,
  refundPayment,
  reserveInventory,
  releaseInventory,
  createShippingLabel,
  shipmentTrackingProgress,
  auditFraudCheck,
  sendConfirmationEmail,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "10s",
  heartbeatTimeout: "5s", // Required for heartbeating activities
  retry: {
    initialInterval: "1s",
    maximumAttempts: 3,
    backoffCoefficient: 2,
  },
});

// Signals & Queries
export const warehousePickupSignal = defineSignal<[{ workerId: string }]> (
  "warehousePickupSignal",
);
export const cancelOrderSignal = defineSignal<[{ reason: string }]> (
  "cancelOrderSignal",
);
export const getOrderStatusQuery = defineQuery<{
  status: string;
  currentStep: string;
  paymentId?: string;
  trackingNumber?: string;
  carrier?: string;
}>("getOrderStatus");

// Synchronous Atomic Workflow Update
export const upgradeToExpressShippingUpdate = defineUpdate<
  ShippingResult,
  [{ expressCarrier: string }]
>("upgradeToExpressShippingUpdate");

// Child Workflow Definition: Modular, isolated risk & compliance check
export async function riskAssessmentChildWorkflow(input: {
  orderId: string;
  customerId: string;
  amount: number;
  forceFailFraud?: boolean;
}): Promise<RiskAssessmentResult> {
  console.log(
    `  ↳ 👶 [Child Workflow:riskAssessmentChildWorkflow] Started for Order ${input.orderId}`,
  );
  const result = await evaluateRiskAndFraud(input);
  console.log(
    `  ↳ 👶 [Child Workflow:riskAssessmentChildWorkflow] Completed with risk score ${result.riskScore}`,
  );
  return result;
}

export async function orderFulfillmentWorkflow(
  input: OrderInput,
): Promise<{ success: boolean; status: string; trackingNumber?: string }> {
  let status = "STARTED";
  let currentStep = "INITIATED";
  let paymentId: string | undefined = undefined;
  let trackingNumber: string | undefined = undefined;
  let carrier = "UPS_STANDARD";
  let inventoryReserved = false;
  let warehousePickedUp = false;
  let isCancelled = false;
  let cancelReason = "";

  // Query Handler
  setHandler(getOrderStatusQuery, () => ({
    status,
    currentStep,
    paymentId,
    trackingNumber,
    carrier,
  }));

  // Signal Handlers
  setHandler(warehousePickupSignal, (data) => {
    warehousePickedUp = true;
    currentStep = `WAREHOUSE_PICKED_UP_BY_${data.workerId}`;
  });

  setHandler(cancelOrderSignal, (data) => {
    isCancelled = true;
    cancelReason = data.reason;
    status = "CANCELLED";
  });

  // Synchronous Update Handler (atomic state mutation + response)
  setHandler(upgradeToExpressShippingUpdate, (data) => {
    if (status === "COMPLETED" || status === "FAILED" || status === "CANCELLED") {
      throw new Error(`Cannot upgrade shipping on completed/failed workflow ${input.orderId}`);
    }
    carrier = data.expressCarrier;
    if (trackingNumber) {
      trackingNumber = trackingNumber.replace("1Z999_TMP_", "1Z999_EXPRESS_");
    } else {
      trackingNumber = `1Z999_EXPRESS_${input.orderId}`;
    }
    console.log(
      `  ⚡ [Temporal Update] Shipping upgraded to ${carrier} (New Tracking: ${trackingNumber})`,
    );
    return { trackingNumber, carrier };
  });

  console.log(
    `\n[Temporal Parent Workflow] Starting Order Fulfillment Workflow for Order ${input.orderId}`,
  );

  try {
    // 0. Execute Child Workflow for Risk & Compliance
    currentStep = "EVALUATING_CHILD_RISK_WORKFLOW";
    const riskResult = await executeChild(riskAssessmentChildWorkflow, {
      args: [{
        orderId: input.orderId,
        customerId: input.customerId,
        amount: input.amount,
        forceFailFraud: input.forceFailFraud,
      }],
      workflowId: `child_risk_${input.orderId}`,
    });

    if (!riskResult.approved) {
      throw new Error(`RISK_REJECTED: Risk score ${riskResult.riskScore} unacceptable`);
    }

    // 1. Process Payment
    currentStep = "PROCESSING_PAYMENT";
    const payment = await processPayment(input);
    paymentId = payment.paymentId;
    currentStep = "PAYMENT_CHARGED";

    if (isCancelled) {
      throw new Error(`CANCELLED: ${cancelReason}`);
    }

    // 2. Reserve Inventory
    currentStep = "RESERVING_INVENTORY";
    await reserveInventory(input);
    inventoryReserved = true;
    currentStep = "INVENTORY_RESERVED";

    // 3. Create Shipping Label
    currentStep = "CREATING_SHIPPING_LABEL";
    const shipping = await createShippingLabel(input);
    trackingNumber = shipping.trackingNumber;
    carrier = shipping.carrier;
    currentStep = "SHIPPING_LABEL_CREATED";

    // 4. Activity Heartbeating Execution
    currentStep = "EXECUTING_HEARTBEATING_DISPATCH_SYNC";
    await shipmentTrackingProgress({ orderId: input.orderId });

    // 5. Zero-Downtime Deterministic Versioning Patch (`patched()`)
    if (patched("v2-add-fraud-audit")) {
      currentStep = "EXECUTING_FRAUD_AUDIT";
      await auditFraudCheck({ orderId: input.orderId });
    }

    // 6. Wait for Human Warehouse Pickup Signal or Cancellation Signal
    currentStep = "WAITING_FOR_WAREHOUSE_PICKUP_SIGNAL";
    console.log(
      `  ⏳ [Workflow] Persisting state & waiting for human warehouse pickup signal for ${input.orderId}...`,
    );

    const signalReceived = await condition(
      () => warehousePickedUp || isCancelled,
      "30 seconds",
    );

    if (isCancelled) {
      throw new Error(`CANCELLED_BY_HUMAN: ${cancelReason}`);
    }

    if (!signalReceived) {
      console.warn(
        `  ⚠️ [Workflow Timeout] No warehouse pickup signal received within timeout for ${input.orderId}`,
      );
    } else {
      console.log(
        `  ✅ [Workflow] Received warehouse pickup signal for Order ${input.orderId}`,
      );
    }

    // 7. Send Confirmation Email
    currentStep = "SENDING_CONFIRMATION_EMAIL";
    await sendConfirmationEmail({
      orderId: input.orderId,
      trackingNumber: trackingNumber || "N/A",
    });

    status = "COMPLETED";
    currentStep = "FULFILLED";
    console.log(
      `🎉 [Workflow] Execution Completed Successfully for Order ${input.orderId}`,
    );

    return { success: true, status, trackingNumber };
  } catch (err: any) {
    status = "FAILED";
    console.error(
      `❌ [Workflow Saga Rollback] Failure in workflow for ${input.orderId}: ${err.message}`,
    );

    // CancellationScope.nonCancellable ensures compensation steps execute even if parent workflow cancellation was requested
    await CancellationScope.nonCancellable(async () => {
      if (inventoryReserved) {
        try {
          await releaseInventory(input);
        } catch {}
      }

      if (paymentId) {
        try {
          await refundPayment({ paymentId, orderId: input.orderId });
        } catch {}
      }
    });

    return { success: false, status };
  }
}
