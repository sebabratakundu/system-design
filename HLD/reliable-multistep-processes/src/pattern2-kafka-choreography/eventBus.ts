import { KafkaJS } from "@confluentinc/kafka-javascript";

export interface KafkaEvent<T = any> {
  id: string;
  type: string;
  partitionKey: string;
  payload: T;
  timestamp: string;
  topic?: string;
  offset?: number;
  partition?: number;
}

export type ConsumerHandler = (
  event: KafkaEvent,
  commitOffset: () => Promise<void>,
) => Promise<void>;

export interface ConsumerSubscription {
  groupId: string;
  topic: string;
  handler: ConsumerHandler;
}

export interface ConsumerOffsetRecord {
  groupId: string;
  topic: string;
  lastCommittedOffset: number;
}

function parseBrokers(input?: string): string {
  if (!input) return "127.0.0.1:9092";
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) {
    return `127.0.0.1:${trimmed}`;
  }
  return trimmed.replace(/localhost/g, "127.0.0.1");
}

export class LocalKafkaEventBus {
  private kafka: KafkaJS.Kafka = null!;
  private producer: KafkaJS.Producer = null!;
  private isConnected = false;
  private localLog: KafkaEvent[] = [];
  private dlqLog: KafkaEvent[] = [];
  private subscriptions: ConsumerSubscription[] = [];
  private realConsumers: KafkaJS.Consumer[] = [];
  private topicOffsets: Map<string, number> = new Map();
  private committedOffsets: Map<string, number> = new Map(); // key: `${groupId}:${topic}`
  private activeDispatchCount = 0;

  constructor(
    private brokers = parseBrokers(
      process.env.PLAINTEXT_PORTS || "127.0.0.1:9092",
    ),
  ) {}

  async init(): Promise<void> {
    try {
      this.kafka = new KafkaJS.Kafka({
        "client.id": "order-fulfillment-service",
        "bootstrap.servers": this.brokers,
        log_level: 0,
      });
      this.producer = this.kafka.producer();
      await this.producer.connect();
      this.isConnected = true;
      console.log(
        "🔌 [Confluent Kafka Client] Connected to local Kafka broker.",
      );
    } catch {
      // Runs 100% locally out-of-the-box without requiring running broker server
      this.isConnected = false;
    }
  }

  async subscribeConsumerGroup(
    groupId: string,
    topic: string,
    handler: ConsumerHandler,
  ): Promise<void> {
    const existingIdx = this.subscriptions.findIndex(
      (s) => s.groupId === groupId && s.topic === topic,
    );
    const sub: ConsumerSubscription = { groupId, topic, handler };
    if (existingIdx >= 0) {
      this.subscriptions[existingIdx] = sub;
    } else {
      this.subscriptions.push(sub);
    }

    if (this.isConnected && this.kafka) {
      try {
        const consumer = this.kafka.consumer({
          "group.id": groupId,
          "auto.offset.reset": "earliest",
          "auto.commit.enable": false,
        });
        await consumer.connect();
        await consumer.subscribe({ topics: [topic] });
        await consumer.run({
          eachMessage: async ({ message, partition }) => {
            this.activeDispatchCount++;
            try {
              const rawVal = message.value?.toString() || "{}";
              const event: KafkaEvent = JSON.parse(rawVal);
              event.offset = Number(message.offset);
              event.partition = partition;
              event.topic = topic;

              const commitFn = async () => {
                try {
                  await consumer.commitOffsets([
                    {
                      topic,
                      partition,
                      offset: (Number(message.offset) + 1).toString(),
                    },
                  ]);
                } catch {}
                this.recordOffsetCommit(groupId, topic, event.offset!);
              };

              await handler(event, commitFn);
            } finally {
              this.activeDispatchCount--;
            }
          },
        });
        this.realConsumers.push(consumer);
        console.log(
          `📥 [Kafka Consumer Group: ${groupId}] Subscribed to topic [${topic}]`,
        );
      } catch {
        console.warn(
          `⚠️ [Consumer Group: ${groupId}] Falling back to in-memory subscription engine.`,
        );
      }
    } else {
      console.log(
        `📥 [Local Consumer Group: ${groupId}] Subscribed to topic [${topic}]`,
      );
    }
  }

  async publish(
    topic: string,
    partitionKey: string,
    type: string,
    payload: any,
    customId?: string,
  ): Promise<KafkaEvent> {
    const currentOffset = (this.topicOffsets.get(topic) ?? 0) + 1;
    this.topicOffsets.set(topic, currentOffset);

    const event: KafkaEvent = {
      id:
        customId ||
        `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type,
      partitionKey,
      payload,
      timestamp: new Date().toISOString(),
      topic,
      offset: currentOffset,
      partition: 0,
    };

    if (this.isConnected && this.producer && this.realConsumers.length > 0) {
      try {
        await this.producer.send({
          topic,
          messages: [{ key: partitionKey, value: JSON.stringify(event) }],
        });
      } catch {}
    } else {
      this.dispatchLocalEvent(event);
    }

    if (topic === "order-events-dlq") {
      this.dlqLog.push(event);
      console.log(
        `☠️ [Kafka DLQ] Routed Poison Message to [${topic}] | Reason: ${payload.reason || "ERROR"}`,
      );
    } else {
      this.localLog.push(event);
      console.log(
        `📡 [Kafka Producer] Topic: [${topic}] | Event: [${type}] | Key: ${partitionKey} | Offset: ${currentOffset}`,
      );
    }

    return event;
  }

  async publishToDLQ(
    originalTopic: string,
    originalEvent: KafkaEvent,
    errorReason: string,
  ): Promise<KafkaEvent> {
    return this.publish(
      "order-events-dlq",
      originalEvent.partitionKey,
      "DeadLetterMessage",
      {
        originalTopic,
        originalEventId: originalEvent.id,
        originalType: originalEvent.type,
        reason: errorReason,
        failedPayload: originalEvent.payload,
      },
    );
  }

  private dispatchLocalEvent(event: KafkaEvent): void {
    const matchingSubs = this.subscriptions.filter(
      (sub) => sub.topic === event.topic,
    );

    for (const sub of matchingSubs) {
      this.activeDispatchCount++;
      setImmediate(async () => {
        try {
          const commitFn = async () => {
            this.recordOffsetCommit(sub.groupId, event.topic!, event.offset!);
          };
          await sub.handler(event, commitFn);
        } catch (err) {
          console.error(
            `❌ [Consumer Group Error] Group [${sub.groupId}]:`,
            err,
          );
        } finally {
          this.activeDispatchCount--;
        }
      });
    }
  }

  async flush(quietMs = 50, timeoutMs = 3000): Promise<void> {
    const start = Date.now();
    let lastActiveTime = Date.now();

    while (Date.now() - start < timeoutMs) {
      if (this.activeDispatchCount > 0) {
        lastActiveTime = Date.now();
      } else if (Date.now() - lastActiveTime >= quietMs) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  private recordOffsetCommit(
    groupId: string,
    topic: string,
    offset: number,
  ): void {
    const key = `${groupId}:${topic}`;
    const prev = this.committedOffsets.get(key) || 0;
    if (offset > prev) {
      this.committedOffsets.set(key, offset);
    }
  }

  getCommittedOffsets(): ConsumerOffsetRecord[] {
    const records: ConsumerOffsetRecord[] = [];
    for (const [key, offset] of this.committedOffsets.entries()) {
      const [groupId, topic] = key.split(":");
      records.push({ groupId, topic, lastCommittedOffset: offset });
    }
    return records;
  }

  getEvents(): KafkaEvent[] {
    return [...this.localLog];
  }

  getDLQEvents(): KafkaEvent[] {
    return [...this.dlqLog];
  }

  async disconnect(): Promise<void> {
    await this.flush();

    for (const consumer of this.realConsumers) {
      try {
        await consumer.disconnect();
      } catch {}
    }
    this.realConsumers = [];

    if (this.isConnected && this.producer) {
      try {
        await this.producer.disconnect();
      } catch {}
      this.isConnected = false;
    }
  }
}
