import { LocalKafkaEventBus, KafkaEvent } from "./eventBus.js";

// Global or shared Idempotency Store (Simulating Redis / Database Unique Constraint index)
export class IdempotencyStore {
  private processedKeys = new Set<string>();

  isProcessed(groupId: string, eventId: string): boolean {
    const key = `${groupId}:${eventId}`;
    return this.processedKeys.has(key);
  }

  markProcessed(groupId: string, eventId: string): void {
    const key = `${groupId}:${eventId}`;
    this.processedKeys.add(key);
  }

  getProcessedCount(): number {
    return this.processedKeys.size;
  }
}

export const globalIdempotencyStore = new IdempotencyStore();

export class PaymentWorker {
  static GROUP_ID = "payment-service-group";

  constructor(
    private bus: LocalKafkaEventBus,
    private idempotencyStore = globalIdempotencyStore,
  ) {}

  async start(): Promise<void> {
    await this.bus.subscribeConsumerGroup(
      PaymentWorker.GROUP_ID,
      "order-events",
      this.handleEvent.bind(this),
    );
  }

  private async handleEvent(
    event: KafkaEvent,
    commitOffset: () => Promise<void>,
  ): Promise<void> {
    // 1. Idempotency Check (At-Least-Once Delivery Protection)
    if (this.idempotencyStore.isProcessed(PaymentWorker.GROUP_ID, event.id)) {
      console.log(
        `  🛡️ [PaymentWorker: ${PaymentWorker.GROUP_ID}] [IDEMPOTENT SKIP] Duplicate event [${event.id}]. Offset committed.`,
      );
      await commitOffset();
      return;
    }

    // 2. Handle Poison Pill / Corrupt Event for DLQ Routing
    if (event.type === "OrderPlaced" && event.payload?.isCorrupt) {
      console.warn(
        `  ⚠️ [PaymentWorker] Poison message detected for Order ${event.payload.orderId}! Routing to DLQ...`,
      );
      await this.bus.publishToDLQ(
        "order-events",
        event,
        "INVALID_ORDER_PAYLOAD_CORRUPT",
      );
      this.idempotencyStore.markProcessed(PaymentWorker.GROUP_ID, event.id);
      await commitOffset();
      return;
    }

    // 3. Process Events
    if (event.type === "OrderPlaced") {
      console.log(
        `  [PaymentWorker] Consumer Group [${PaymentWorker.GROUP_ID}] processing payment for Order: ${event.payload.orderId}`,
      );

      if (event.payload?.forceFailPayment) {
        await this.bus.publish(
          "order-events",
          event.partitionKey,
          "PaymentFailed",
          {
            orderId: event.payload.orderId,
            reason: "CARD_DECLINED",
          },
        );
      } else {
        await this.bus.publish(
          "order-events",
          event.partitionKey,
          "PaymentCharged",
          {
            orderId: event.payload.orderId,
            paymentId: `pay_${event.payload.orderId}_kafka`,
            amount: event.payload.amount,
            forceFailInventory: event.payload?.forceFailInventory,
          },
        );
      }
    }

    if (event.type === "InventoryFailed") {
      console.log(
        `  [PaymentWorker SAGA ROLLBACK] Reactive Saga Unwinding: Refunding payment for Order ${event.payload.orderId}...`,
      );
      await this.bus.publish(
        "order-events",
        event.partitionKey,
        "PaymentRefunded",
        {
          orderId: event.payload.orderId,
          refundId: `ref_${event.payload.orderId}_kafka`,
        },
      );
    }

    // 4. Mark Processed & Commit Partition Offset
    this.idempotencyStore.markProcessed(PaymentWorker.GROUP_ID, event.id);
    await commitOffset();
  }
}

export class InventoryWorker {
  static GROUP_ID = "inventory-service-group";

  constructor(
    private bus: LocalKafkaEventBus,
    private idempotencyStore = globalIdempotencyStore,
  ) {}

  async start(): Promise<void> {
    await this.bus.subscribeConsumerGroup(
      InventoryWorker.GROUP_ID,
      "order-events",
      this.handleEvent.bind(this),
    );
  }

  private async handleEvent(
    event: KafkaEvent,
    commitOffset: () => Promise<void>,
  ): Promise<void> {
    if (this.idempotencyStore.isProcessed(InventoryWorker.GROUP_ID, event.id)) {
      console.log(
        `  🛡️ [InventoryWorker: ${InventoryWorker.GROUP_ID}] [IDEMPOTENT SKIP] Duplicate event [${event.id}]. Offset committed.`,
      );
      await commitOffset();
      return;
    }

    if (event.type === "PaymentCharged") {
      console.log(
        `  [InventoryWorker] Consumer Group [${InventoryWorker.GROUP_ID}] reserving stock for Order: ${event.payload.orderId}`,
      );

      if (event.payload?.forceFailInventory) {
        await this.bus.publish(
          "order-events",
          event.partitionKey,
          "InventoryFailed",
          {
            orderId: event.payload.orderId,
            reason: "OUT_OF_STOCK",
          },
        );
      } else {
        await this.bus.publish(
          "order-events",
          event.partitionKey,
          "InventoryReserved",
          {
            orderId: event.payload.orderId,
          },
        );
      }
    }

    this.idempotencyStore.markProcessed(InventoryWorker.GROUP_ID, event.id);
    await commitOffset();
  }
}

export class ShippingWorker {
  static GROUP_ID = "shipping-service-group";

  constructor(
    private bus: LocalKafkaEventBus,
    private idempotencyStore = globalIdempotencyStore,
  ) {}

  async start(): Promise<void> {
    await this.bus.subscribeConsumerGroup(
      ShippingWorker.GROUP_ID,
      "order-events",
      this.handleEvent.bind(this),
    );
  }

  private async handleEvent(
    event: KafkaEvent,
    commitOffset: () => Promise<void>,
  ): Promise<void> {
    if (this.idempotencyStore.isProcessed(ShippingWorker.GROUP_ID, event.id)) {
      console.log(
        `  🛡️ [ShippingWorker: ${ShippingWorker.GROUP_ID}] [IDEMPOTENT SKIP] Duplicate event [${event.id}]. Offset committed.`,
      );
      await commitOffset();
      return;
    }

    if (event.type === "InventoryReserved") {
      console.log(
        `  [ShippingWorker] Consumer Group [${ShippingWorker.GROUP_ID}] generating carrier label for Order: ${event.payload.orderId}`,
      );
      await this.bus.publish(
        "order-events",
        event.partitionKey,
        "ShippingLabelCreated",
        {
          orderId: event.payload.orderId,
          trackingNumber: `1Z999_KAFKA_${event.payload.orderId}`,
        },
      );
    }

    this.idempotencyStore.markProcessed(ShippingWorker.GROUP_ID, event.id);
    await commitOffset();
  }
}

export class DLQWorker {
  static GROUP_ID = "dlq-monitoring-group";

  constructor(private bus: LocalKafkaEventBus) {}

  async start(): Promise<void> {
    await this.bus.subscribeConsumerGroup(
      DLQWorker.GROUP_ID,
      "order-events-dlq",
      this.handleEvent.bind(this),
    );
  }

  private async handleEvent(
    event: KafkaEvent,
    commitOffset: () => Promise<void>,
  ): Promise<void> {
    console.log(
      `  🔍 [DLQ Monitor] Consumer Group [${DLQWorker.GROUP_ID}] received Dead Letter Message for Order: ${event.payload.failedPayload?.orderId} | Reason: ${event.payload.reason}`,
    );
    await commitOffset();
  }
}
