# Architectural Guide: Reliable Multi-Step Distributed Processes

Building reliable multi-step processes across distributed services (e.g., e-commerce order fulfillment, payment processing, AI agent pipelines, human-in-the-loop approvals) requires bridging the gap between clean business logic and flaky infrastructure.

This guide structures each workflow pattern into three clear sections:
1. **The Problem** (Why previous/naive approaches fail)
2. **The Solution** (Architecture & Production Code Implementation)
3. **What We Get From This Solution** (Key guarantees, benefits & trade-offs)

Following the patterns, a detailed section covers **5 Common Interview Deep Dives with Production Code Examples**.

---

## The Running Example: Order Fulfillment Workflow

Throughout this guide, we use the following 5-step distributed order fulfillment sequence:

```
[1. Charge Payment] ──► [2. Reserve Inventory] ──► [3. Create Shipping Label] ──► [4. Wait for Warehouse Pickup] ──► [5. Send Confirmation Email]
```

---

## Pattern 0: The Baseline Naive Single-Server Execution

### 1. The Problem
In an ideal world, a single function calls each service sequentially:

```typescript
async function fulfillOrder(order: Order): Promise<OrderResult> {
  try {
    await chargePayment(order);       // Step 1
    await reserveInventory(order);     // Step 2 (Server crashes here!)
    await createShippingLabel(order);  // Step 3
    await sendConfirmationEmail(order);// Step 4
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

- **Memory Loss on Crash:** If the server hosting this function crashes after charging payment, RAM is cleared. When restarted, the system forgets the order existed. The customer is charged, but no items ship.
- **No Distributed Atomicity:** You cannot hold a single database transaction lock across external third-party HTTP services (Stripe, FedEx).
- **Callback Routing Failure:** If the payment gateway responds via an asynchronous webhook, load balancers will route the callback to a different host that has no memory of the original request connection.

---

## Pattern 1: Database-Backed State Machine & Background Poller

### 1. The Problem
To survive server crashes and async callbacks without external workflow engines, we must persist state checkpoints to a database after every single step and handle stalled orders manually.

### 2. The Solution
We store each state checkpoint in PostgreSQL/MySQL and run a background poller worker that locks stuck rows, resumes execution from the last checkpoint, or executes compensation (rollback) steps.

Code reference: [db.ts](file:///Users/sebabratakundu/programming/system-design/reliable-multistep-processes/src/pattern1-db-statemachine/db.ts) & [orchestrator.ts](file:///Users/sebabratakundu/programming/system-design/reliable-multistep-processes/src/pattern1-db-statemachine/orchestrator.ts)

```typescript
export class ProductionOrderOrchestrator {
  constructor(private db: ProductionOrderDB) {}

  async processOrder(orderId: string, workerId: string): Promise<void> {
    // 1. Atomic lock claim with lock expiration check
    let currentOrder = await this.db.claimLock(orderId, workerId, 1500 /* lock duration */);
    if (!currentOrder) return; // Locked by another worker

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
      }

      // Step 2: Reserve Inventory
      if (currentOrder.state === 'PAYMENT_CHARGED') {
        try {
          await ProductionInventoryService.reserve({
            idempotencyKey: `idemp_inv_${currentOrder.id}`,
            items: currentOrder.items,
          });
          currentOrder = await this.db.updateState(currentOrder.id, currentOrder.version, 'INVENTORY_RESERVED');
        } catch (err) {
          // Failure -> Trigger Saga Rollback state
          currentOrder = await this.db.updateState(currentOrder.id, currentOrder.version, 'ROLLBACK_PAYMENT');
        }
      }

      // Step 3: Compensation Handling
      if (currentOrder.state === 'ROLLBACK_PAYMENT') {
        if (currentOrder.paymentId) {
          await ProductionPaymentGateway.refund({
            idempotencyKey: `idemp_ref_${currentOrder.id}`,
            paymentId: currentOrder.paymentId,
          });
        }
        await this.db.updateState(currentOrder.id, currentOrder.version, 'FAILED_UNRECOVERABLE');
      }
    } finally {
      await this.db.releaseLock(orderId, workerId);
    }
  }

  // Poller scans for orders with expired locks
  async runBackgroundPoller(workerId: string) {
    const stuck = await this.db.findStuckOrders();
    for (const order of stuck) {
      await this.processOrder(order.id, workerId);
    }
  }
}
```

### 3. What We Get From This Solution
- **State Durability Across Crashes:** If the host dies after charging payment, the row state remains `PAYMENT_CHARGED`. The poller claims the order when the lock expires and resumes directly at Step 2 without double-charging.
- **Race Condition Prevention:** Optimistic concurrency checks (`version`) and lock windows (`lockedUntil`) ensure two API servers don't pick up the same order simultaneously.
- **Trade-offs:** 
  > [!WARNING]
  > High database polling load, hand-rolled locking mechanics, and massive boilerplate code for every state transition and rollback branch.

---

## Pattern 2: Event-Driven Choreography (Official `@confluentinc/kafka-javascript`)

### 1. The Problem
As business logic expands, a single centralized orchestrator codebase becomes a monolithic bottleneck. Different teams (Payments team, Warehouse team, Shipping team) need to own their own services independently without hard-coded API couplings.

### 2. The Solution
Each service acts as an autonomous worker subscribing to an append-only event log using the official **`@confluentinc/kafka-javascript`** package. Workers perform local actions and emit new domain events (`OrderPlaced`, `PaymentCharged`, `InventoryFailed`). Sagas flow backwards by emitting and reacting to failure events.

Code reference: [eventBus.ts](file:///Users/sebabratakundu/programming/system-design/reliable-multistep-processes/src/pattern2-kafka-choreography/eventBus.ts) & [workers.ts](file:///Users/sebabratakundu/programming/system-design/reliable-multistep-processes/src/pattern2-kafka-choreography/workers.ts)

```typescript
import KafkaJS from '@confluentinc/kafka-javascript';
const { Kafka } = KafkaJS;

// Confluent Kafka Client Interface
export class LocalKafkaEventBus {
  private kafka = new Kafka({
    'bootstrap.servers': process.env.KAFKA_BROKERS || 'localhost:9092',
    'client.id': 'order-fulfillment-local',
  });
  private producer = this.kafka.producer();

  async publish(topic: string, partitionKey: string, type: string, payload: any) {
    const event = { id: `evt_${Date.now()}`, type, partitionKey, payload, timestamp: new Date().toISOString() };
    try {
      await this.producer.send({
        topic,
        messages: [{ key: partitionKey, value: JSON.stringify(event) }],
      });
    } catch {}
    return event;
  }
}

// Payment Worker subscribing to Kafka event stream
export class PaymentWorker {
  constructor(private bus: LocalKafkaEventBus) {}

  async handleEvent(event: KafkaEvent): Promise<void> {
    if (event.type === 'OrderPlaced') {
      const paymentId = `pay_${event.payload.orderId}_kafka`;
      await this.bus.publish('order-events', event.partitionKey, 'PaymentCharged', {
        orderId: event.payload.orderId,
        paymentId,
      });
    }

    if (event.type === 'InventoryFailed') {
      console.log(`[PaymentWorker SAGA ROLLBACK] Refunding payment for Order ${event.payload.orderId}...`);
      await this.bus.publish('order-events', event.partitionKey, 'PaymentRefunded', {
        orderId: event.payload.orderId,
      });
    }
  }
}
```

### 3. What We Get From This Solution
- **High-Performance Confluent SDK:** Powered by `@confluentinc/kafka-javascript` with native C/C++ librdkafka bindings for high throughput.
- **Loose Coupling & High Scalability:** Services don't call each other's APIs directly. They only consume and publish log events.
- **Automatic Partition Re-balancing:** If a worker node crashes, Kafka reassigns its log partitions to another worker. Since log offsets are committed only after event processing, no events are lost.
- **Trade-offs:**
  > [!IMPORTANT]
  > Implicit flow control. There is no single file or visual graph showing the entire sequence. Tracking down why an order stalled requires aggregated distributed tracing across all worker event logs.

---

## Pattern 3: Orchestrated Saga via Durable Execution (Temporal)

### 1. The Problem
Event choreography becomes unmaintainable when workflows involve complex conditional branching, loops, human-in-the-loop approvals, or strict centralized auditing requirements. Hand-rolling state machines leads to massive DB boilerplate.

### 2. The Solution
Durable Execution allows you to write workflow logic as standard code (`TypeScript`, `Go`, `Python`). The underlying engine (Temporal) intercepts activity invocations and persists every result in an append-only event history log.

Code reference: [workflow.ts](file:///Users/sebabratakundu/programming/system-design/reliable-multistep-processes/src/pattern3-temporal-durable/workflow.ts) & [temporalEngineSim.ts](file:///Users/sebabratakundu/programming/system-design/reliable-multistep-processes/src/pattern3-temporal-durable/temporalEngineSim.ts)

```typescript
export async function runProductionOrderWorkflow(
  engine: ProductionTemporalEngineSimulator,
  workflowId: string,
  input: OrderInput
): Promise<{ success: boolean }> {
  let paymentId: string | null = null;
  let inventoryReserved = false;

  try {
    // Step 1: Charge Payment (Activity)
    const payment = await engine.executeActivity(workflowId, 'processPayment', () =>
      productionActivities.processPayment(input)
    );
    paymentId = payment.paymentId;

    // Step 2: Reserve Inventory (Activity)
    await engine.executeActivity(workflowId, 'reserveInventory', () =>
      productionActivities.reserveInventory(input)
    );
    inventoryReserved = true;

    // Step 3: Create Shipping Label (Activity)
    const shipping = await engine.executeActivity(workflowId, 'createShippingLabel', () =>
      productionActivities.createShippingLabel(input)
    );

    // Step 4: Version Patching Example
    if (engine.isPatched('v2-add-fraud-audit')) {
      await engine.executeActivity(workflowId, 'auditFraudCheck', () =>
        productionActivities.auditFraudCheck({ orderId: input.orderId })
      );
    }

    // Step 5: Wait for Human Signal (Warehouse scan)
    const pickupSignal = engine.consumeSignal(workflowId, 'warehousePickupSignal');
    if (!pickupSignal) return { success: false };

    await engine.executeActivity(workflowId, 'sendConfirmationEmail', () =>
      productionActivities.sendConfirmationEmail({ orderId: input.orderId, trackingNumber: shipping.trackingNumber })
    );

    return { success: true };
  } catch (error) {
    // SAGA COMPENSATION BLOCK
    if (inventoryReserved) await engine.executeActivity(workflowId, 'releaseInventory', () => productionActivities.releaseInventory(input));
    if (paymentId) await engine.executeActivity(workflowId, 'refundPayment', () => productionActivities.refundPayment({ paymentId: paymentId!, orderId: input.orderId }));
    throw error;
  }
}
```

### 3. What We Get From This Solution
- **Deterministic Replay Recovery:** On worker crash, a new worker replays the workflow code from line 1. Completed activities are fetched directly from history—**side-effects like charging a card are never re-executed!**
- **Resource-Free Waiting (Signals):** The workflow can pause for days waiting for human webhooks/signals without consuming CPU or thread RAM. State is hydrated automatically on signal arrival.
- **Code Versioning (`patched()`):** Upgrade live workflow code without breaking replay history for existing in-flight executions.
- **Trade-offs:** 
  > [!NOTE]
  > Workflow code must be strictly deterministic (no random numbers, direct system clock reads, or non-deterministic global state inside workflow functions).

---

## Pattern 4: Declarative Workflow Engines (AWS Step Functions)

### 1. The Problem
Operating self-hosted workflow engine clusters (like Temporal or Kafka) introduces significant DevOps infrastructure overhead. Fully serverless architectures need a managed orchestration tool.

### 2. The Solution
Workflows are declared as a State Machine in Amazon States Language (ASL JSON/YAML). AWS handles execution state persistence, visual flow graphs, automatic retries, and `Catch` state routing serverlessly.

Code reference: [stateMachine.json](file:///Users/sebabratakundu/programming/system-design/reliable-multistep-processes/src/pattern4-step-functions/stateMachine.json) & [runner.ts](file:///Users/sebabratakundu/programming/system-design/reliable-multistep-processes/src/pattern4-step-functions/runner.ts)

```json
{
  "Comment": "Production Order Fulfillment Workflow",
  "StartAt": "ChargePayment",
  "States": {
    "ChargePayment": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:us-east-1:123456789012:function:chargePaymentLambda",
      "ResultPath": "$.paymentResult",
      "Retry": [{ "ErrorEquals": ["Lambda.ServiceException"], "IntervalSeconds": 1, "MaxAttempts": 3, "BackoffRate": 2.0 }],
      "Next": "ReserveInventory",
      "Catch": [{ "ErrorEquals": ["States.ALL"], "Next": "OrderFailed" }]
    },
    "ReserveInventory": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:us-east-1:123456789012:function:reserveInventoryLambda",
      "ResultPath": "$.inventoryResult",
      "Next": "CreateShippingLabel",
      "Catch": [{ "ErrorEquals": ["States.ALL"], "Next": "RefundPayment" }]
    },
    "RefundPayment": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:us-east-1:123456789012:function:refundPaymentLambda",
      "Next": "OrderFailed"
    },
    "OrderFailed": { "Type": "Fail", "Cause": "Order fulfillment failed." }
  }
}
```

### 3. What We Get From This Solution
- **Zero Infrastructure Maintenance:** Fully managed by AWS. No worker servers or clusters to patch.
- **Visual Auditing & Debugging:** AWS Console renders real-time visual state graphs showing exactly which state succeeded, failed, or timed out.
- **Trade-offs:** 
  > [!CAUTION]
  > Declarative JSON can become verbose and rigid compared to writing pure code. Execution payloads between states are capped at 256KB.

---

## 5 Common Interview Deep Dives (With Concrete Code Examples)

Interviewers probe deep into failure modes, edge cases, and scaling issues. Below are the 5 classic deep-dive questions with production architectural answers and code solutions.

---

### Deep Dive 1: Process Crashes Mid-Way & Crash Recovery Mechanics

#### ❓ The Interviewer Asks:
*"Suppose your server has charged the customer's credit card and reserved inventory, but the host crashes before creating a shipping label. When a new host boots up, how does it know what happened, and how do you ensure the card isn't double-charged?"*

#### 💡 The Production Solution:
Progress must be recorded into a durable storage layer **before** proceeding to the next step. Recovery works by reading the last checkpoint or replaying recorded history.

1. **In DB-Backed State Machine:** The row state remains `INVENTORY_RESERVED`. When a new worker claims the expired lock, it evaluates `if (order.state === 'INVENTORY_RESERVED')` and skips payment and inventory calls completely.
2. **In Durable Execution (Temporal):** The Temporal server maintains an append-only event history database. When Worker B picks up the crashed workflow, it replays the code from line 1. When it reaches `processPayment`, the engine finds `{ paymentId: 'pay_123' }` in history and returns the recorded result without invoking the payment service API again.

#### 💻 Production Code Example (Temporal Replay Engine Mechanic):

```typescript
// How Temporal prevents re-firing side effects during crash recovery replay:
async function executeActivityWithReplay<T>(workflowId: string, activityName: string, fn: () => Promise<T>): Promise<T> {
  const history = await db.getWorkflowHistory(workflowId);

  // Check if activity was completed prior to crash
  const cachedEntry = history.find(e => e.type === 'ACTIVITY_COMPLETED' && e.name === activityName);
  if (cachedEntry) {
    console.log(`[Replay Log] Activity ${activityName} found in history. Returning cached result without calling API.`);
    return cachedEntry.result; // Zero side-effect re-execution!
  }

  // Live execution for uncompleted activity
  const result = await fn();
  await db.appendHistory(workflowId, { type: 'ACTIVITY_COMPLETED', name: activityName, result });
  return result;
}
```

---

### Deep Dive 2: Exactly-Once Processing & Network Idempotency

#### ❓ The Interviewer Asks:
*"Network calls drop, timeout, or return HTTP 504 Gateway Timeout. If your worker retries sending an email or charging a card, how do you prevent duplicate charges or duplicate emails?"*

#### 💡 The Production Solution:
True exactly-once network transmission across distributed systems is impossible due to network partitions (CAP theorem). Therefore, **attempts are at-least-once, and effects are exactly-once via idempotency**.

To eliminate race conditions between checking and executing:
1. Pass a unique deterministic **Idempotency Key** (e.g. `idemp_pay_${orderId}`) to external APIs.
2. Track internal 2-phase idempotency status: mark status `IN_PROGRESS` prior to side-effects, and `COMPLETED` after.

#### 💻 Production Code Example (Idempotency Key Middleware & DB Check):

```typescript
export async function chargePaymentIdempotent(orderId: string, amount: number) {
  const idempotencyKey = `pay_idemp_${orderId}`;

  // Step 1: Pre-check DB idempotency table
  const existingRecord = await db.idempotency.find(idempotencyKey);
  if (existingRecord?.status === 'COMPLETED') {
    return existingRecord.result; // Harmless duplicate retry return
  }

  if (existingRecord?.status === 'IN_PROGRESS') {
    // A concurrent attempt is running or crashed mid-flight. Reconcile with gateway.
    const gatewayStatus = await StripeAPI.verifyCharge(idempotencyKey);
    if (gatewayStatus.found) return gatewayStatus.charge;
  }

  // Step 2: Mark IN_PROGRESS
  await db.idempotency.upsert(idempotencyKey, { status: 'IN_PROGRESS' });

  // Step 3: Call external gateway with idempotency header
  const charge = await StripeAPI.createCharge({ amount, currency: 'usd' }, { idempotencyKey });

  // Step 4: Mark COMPLETED
  await db.idempotency.update(idempotencyKey, { status: 'COMPLETED', result: charge });
  return charge;
}
```

---

### Deep Dive 3: Workflow Versioning & In-Flight Executions Migration

#### ❓ The Interviewer Asks:
*"You have 50,000 active loan approval workflows running that take 14 days to complete. You deploy new code adding a new Fraud Audit step. How do you deploy this without breaking in-flight executions replay?"*

#### 💡 The Production Solution:
Directly changing workflow code causes deterministic replay errors for in-flight instances (history log has 5 steps, but new code expects step 6).

- **Strategy 1: Separate Workflow Types:** Deploy new code as `OrderWorkflowV2`. In-flight instances continue executing on `OrderWorkflowV1` until finished.
- **Strategy 2: Dynamic In-Code Patching (`patched()`):** Use patch markers recorded in history to determine whether a given workflow instance has taken the old or new path.

#### 💻 Production Code Example (Temporal `patched()` Implementation):

```typescript
import { patched } from '@temporalio/workflow';

export async function processOrderWorkflow(order: OrderInput) {
  await processPayment(order);
  await reserveInventory(order);

  // In-flight workflows whose history log already passed this point return false.
  // New workflows (or in-flight ones reaching this line for the first time) return true!
  if (patched('add-fraud-audit-v2')) {
    await auditFraudCheck({ orderId: order.id }); // Executed for new/v2 workflows
  } else {
    // Workflows started before the patch stay on legacy path safely
  }

  await shipOrder(order);
}
```

---

### Deep Dive 4: Controlling Workflow State/History Size (`Continue-as-New`)

#### ❓ The Interviewer Asks:
*"In long-running or infinitely looping workflows (e.g. an AI agent pipeline or monthly subscription billing engine), the event history database can grow to hundreds of megabytes. How do you keep history size under control?"*

#### 💡 The Production Solution:
Large history logs cause high memory consumption, slow replay recovery, and engine performance degradation.

The standard fix is **`Continue-as-New`**:
1. Monitor workflow event count or execution iteration.
2. Periodically capture current state payload snapshot (e.g. `{ currentBalance, iterationCount }`).
3. Terminate current workflow run and atomically start a brand-new workflow execution with clean history, passing the snapshot state as initial input.

#### 💻 Production Code Example (`Continue-as-New` Loop Pattern):

```typescript
import { continueAsNew } from '@temporalio/workflow';

export async function subscriptionBillingWorkflow(state: { userId: string; totalBilled: number; cycleCount: number }) {
  await processMonthlyPayment(state.userId);
  await sendInvoice(state.userId);

  const nextState = {
    userId: state.userId,
    totalBilled: state.totalBilled + 99,
    cycleCount: state.cycleCount + 1,
  };

  // Reset history after 12 monthly cycles to prevent infinite history growth!
  if (nextState.cycleCount % 12 === 0) {
    console.log(`[Continue-as-New] Resetting history log for user ${state.userId}...`);
    await continueAsNew<typeof subscriptionBillingWorkflow>(nextState);
  }

  await sleep('30 days');
}
```

---

### Deep Dive 5: Human-in-the-Loop & Asynchronous External Events

#### ❓ The Interviewer Asks:
*"Step 4 requires a physical warehouse worker to pick the item and scan a barcode. This might take 5 minutes or 14 days. How do you handle long human waits without holding server threads or polling database in loops?"*

#### 💡 The Production Solution:
Polling database loops or keeping HTTP worker threads open is wasteful and unreliable across host deployments.

- **Durable Execution Signals (Temporal):** Workflow persists state to database and releases worker thread RAM. When human scans barcode, external API calls `signal('warehousePickupSignal')`. Temporal rehydrates workflow state onto any available worker instantly.
- **AWS Task Tokens (`waitForTaskToken`):** Step Functions emits a token to SQS/EventBridge and pauses execution. The warehouse portal invokes `SendTaskSuccess(taskToken)` when scanned, resuming state machine.

#### 💻 Production Code Example (Temporal Signal & AWS Task Token):

```typescript
// Temporal TypeScript Signal Handler:
export const warehousePickupSignal = defineSignal<[{ workerId: string }]>('warehousePickupSignal');

export async function humanWorkflow(orderId: string) {
  let pickupData: { workerId: string } | null = null;
  setHandler(warehousePickupSignal, (data) => { pickupData = data; });

  await sendNotificationToWarehouseApp(orderId);

  // Workflow sleeps durably (0 CPU / 0 Thread RAM) for up to 14 days
  const isScanned = await condition(() => pickupData !== null, '14 days');
  if (!isScanned) {
    await triggerEscalationManager(orderId);
    return;
  }

  await processPickup(pickupData);
}
```

---

## Architectural Summary Matrix

| Criteria | Pattern 1: DB State Machine | Pattern 2: Confluent Kafka (`@confluentinc/kafka-javascript`) | Pattern 3: Temporal Execution | Pattern 4: AWS Step Functions |
| :--- | :--- | :--- | :--- | :--- |
| **SDK / Package** | PostgreSQL / SQL Client | `@confluentinc/kafka-javascript` | `@temporalio/workflow` | AWS SDK / ASL JSON |
| **Crash Recovery** | Poller scans expired locks | Consumer offset partition reassignment | Replays history log to reconstruct state | Resumes from serverless state |
| **Idempotency** | Manual DB idempotency tables | Consumer message deduplication | Activity idempotency keys | Lambda request idempotency keys |
| **Versioning** | DB state column migrations | Topic event schema versioning | `patched('flag')` dynamic branches | State Machine ARN versioning |
| **History Truncation** | Purge completed DB rows | Log retention policy / Compaction | `Continue-as-New` API | Execution history retention limits |
| **Human Callback** | Polling DB / Webhooks | Event consumers | Signals & `condition()` waits | `waitForTaskToken` callbacks |
