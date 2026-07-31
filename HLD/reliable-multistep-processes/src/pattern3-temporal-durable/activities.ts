import { Context } from "@temporalio/activity";
import { ApplicationFailure } from "@temporalio/common";

export interface OrderInput {
  orderId: string;
  amount: number;
  customerId: string;
  forceFailInventory?: boolean;
  forceFailPaymentExpired?: boolean;
  forceFailFraud?: boolean;
}

export interface PaymentResult {
  paymentId: string;
  status: "CHARGED";
}

export interface ShippingResult {
  trackingNumber: string;
  carrier: string;
}

export interface RiskAssessmentResult {
  approved: boolean;
  riskScore: number;
}

export async function evaluateRiskAndFraud(input: {
  orderId: string;
  customerId: string;
  amount: number;
  forceFailFraud?: boolean;
}): Promise<RiskAssessmentResult> {
  console.log(
    `  [ChildActivity:evaluateRiskAndFraud] Assessing risk score for Order ${input.orderId} (Customer: ${input.customerId}, Amount: $${input.amount})`,
  );
  if (input.forceFailFraud || input.customerId === "blacklisted_user") {
    // Non-retryable Application Failure: Fraud detection cannot be resolved by retrying
    throw ApplicationFailure.nonRetryable(
      `FRAUD_DETECTED: Customer ${input.customerId} failed automated compliance risk check.`,
      "HIGH_RISK_CUSTOMER",
    );
  }
  return { approved: true, riskScore: 12 };
}

export async function processPayment(input: OrderInput): Promise<PaymentResult> {
  console.log(
    `  [Activity:processPayment] Charging $${input.amount} for Order ${input.orderId} (Customer: ${input.customerId})`,
  );
  if (input.forceFailPaymentExpired) {
    // Terminal business failure - retrying will NOT change an expired credit card
    throw ApplicationFailure.nonRetryable(
      `PAYMENT_REJECTED: Credit card for customer ${input.customerId} is expired.`,
      "CARD_EXPIRED",
    );
  }
  return { paymentId: `pay_${input.orderId}_temporal`, status: "CHARGED" };
}

export async function refundPayment(input: {
  paymentId: string;
  orderId: string;
}): Promise<void> {
  console.log(
    `  [Activity:refundPayment] ↩️ Saga Compensation: Refunding payment ${input.paymentId} for Order ${input.orderId}`,
  );
}

export async function reserveInventory(input: OrderInput): Promise<void> {
  console.log(
    `  [Activity:reserveInventory] Reserving warehouse inventory for Order ${input.orderId}`,
  );
  if (input.forceFailInventory) {
    throw new Error(
      `INVENTORY_OUT_OF_STOCK: Order ${input.orderId} item is unavailable.`,
    );
  }
}

export async function releaseInventory(input: OrderInput): Promise<void> {
  console.log(
    `  [Activity:releaseInventory] ↩️ Saga Compensation: Releasing warehouse inventory reservation for Order ${input.orderId}`,
  );
}

export async function createShippingLabel(
  input: OrderInput,
): Promise<ShippingResult> {
  console.log(
    `  [Activity:createShippingLabel] Calling carrier API to create label for Order ${input.orderId}`,
  );
  return {
    trackingNumber: `1Z999_TMP_${input.orderId}`,
    carrier: "UPS_STANDARD",
  };
}

export async function shipmentTrackingProgress(input: {
  orderId: string;
}): Promise<void> {
  console.log(
    `  [Activity:shipmentTrackingProgress] Starting long-running package dispatch sync for ${input.orderId}...`,
  );
  const totalSteps = 3;
  for (let step = 1; step <= totalSteps; step++) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    // Emit heartbeat to Temporal server so server knows activity worker is alive
    Context.current().heartbeat({ step, progressPercent: Math.round((step / totalSteps) * 100) });
    console.log(
      `    💓 [Activity Heartbeat] Dispatch step ${step}/${totalSteps} complete (${Math.round((step / totalSteps) * 100)}%)`,
    );
  }
}

export async function auditFraudCheck(input: {
  orderId: string;
}): Promise<void> {
  console.log(
    `  [Activity:auditFraudCheck] 🛡️ [Version Patch v2 Feature] Executed fraud audit check for ${input.orderId}`,
  );
}

export async function sendConfirmationEmail(input: {
  orderId: string;
  trackingNumber: string;
}): Promise<void> {
  console.log(
    `  [Activity:sendConfirmationEmail] Sent confirmation email for Order ${input.orderId} (Tracking: ${input.trackingNumber})`,
  );
}

export const productionActivities = {
  evaluateRiskAndFraud,
  processPayment,
  refundPayment,
  reserveInventory,
  releaseInventory,
  createShippingLabel,
  shipmentTrackingProgress,
  auditFraudCheck,
  sendConfirmationEmail,
};
