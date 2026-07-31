import { LocalKafkaEventBus } from "./eventBus.js";
import {
  PaymentWorker,
  InventoryWorker,
  ShippingWorker,
  DLQWorker,
} from "./workers.js";

async function main() {
  console.log("================================================================");
  console.log("PATTERN 2: Event-Driven Choreography (Confluent Kafka Consumer Groups)");
  console.log("================================================================");

  const bus = new LocalKafkaEventBus();

  try {
    await bus.init();

    // 1. Initialize Worker Consumer Groups & Register Subscriptions
    const paymentWorker = new PaymentWorker(bus);
    const inventoryWorker = new InventoryWorker(bus);
    const shippingWorker = new ShippingWorker(bus);
    const dlqWorker = new DLQWorker(bus);

    await paymentWorker.start();
    await inventoryWorker.start();
    await shippingWorker.start();
    await dlqWorker.start();

    // Scenario A: Happy Path Event Cascade across Consumer Groups
    console.log("\n--- Scenario A: Order Placement & Async Consumer Cascade ---");
    await bus.publish(
      "order-events",
      "ORD-LOCAL-201",
      "OrderPlaced",
      { orderId: "ORD-LOCAL-201", amount: 199 },
    );
    await bus.flush();

    // Scenario B: Inventory Out of Stock -> Reactive Saga Compensation Unwinding
    console.log("\n--- Scenario B: Inventory Failed -> Reactive Saga Unwinding ---");
    await bus.publish(
      "order-events",
      "ORD-LOCAL-202",
      "OrderPlaced",
      { orderId: "ORD-LOCAL-202", amount: 99, forceFailInventory: true },
    );
    await bus.flush();

    // Scenario C: At-Least-Once Redelivery & Consumer Idempotency Deduplication
    console.log("\n--- Scenario C: At-Least-Once Redelivery & Consumer Idempotency ---");
    const duplicateEventId = "evt_duplicate_test_201";
    await bus.publish(
      "order-events",
      "ORD-LOCAL-201",
      "OrderPlaced",
      { orderId: "ORD-LOCAL-201", amount: 199 },
      duplicateEventId,
    );
    await bus.flush();

    console.log("  🔁 [Kafka Redelivery Simulation] Re-sending exact same event payload to consumer group...");
    await bus.publish(
      "order-events",
      "ORD-LOCAL-201",
      "OrderPlaced",
      { orderId: "ORD-LOCAL-201", amount: 199 },
      duplicateEventId,
    );
    await bus.flush();

    // Scenario D: Poison Pill Message & Dead Letter Queue (DLQ) Routing
    console.log("\n--- Scenario D: Corrupt Message -> Dead Letter Queue (DLQ) Routing ---");
    await bus.publish(
      "order-events",
      "ORD-CORRUPT-404",
      "OrderPlaced",
      { orderId: "ORD-CORRUPT-404", amount: 0, isCorrupt: true },
    );
    await bus.flush();

    // Audit Summaries
    console.log("\n--- Kafka Topic Published Events Stream ---");
    console.table(
      bus.getEvents().map((e) => ({
        offset: e.offset,
        topic: e.topic,
        type: e.type,
        key: e.partitionKey,
        payload: JSON.stringify(e.payload),
      })),
    );

    console.log("\n--- Kafka Consumer Group Committed Offsets ---");
    console.table(bus.getCommittedOffsets());

    console.log("\n--- Dead Letter Queue (order-events-dlq) Audit Log ---");
    console.table(
      bus.getDLQEvents().map((e) => ({
        offset: e.offset,
        type: e.type,
        originalTopic: e.payload.originalTopic,
        originalEventId: e.payload.originalEventId,
        reason: e.payload.reason,
      })),
    );
  } finally {
    await bus.disconnect();
  }
}

main().catch(console.error);
