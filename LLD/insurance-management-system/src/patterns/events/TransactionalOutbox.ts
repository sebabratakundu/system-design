import { IDomainEvent } from './DomainEvent.js';

export interface OutboxRecord {
  id: string;
  event: IDomainEvent;
  published: boolean;
  publishedAt?: Date;
}

export type EventSubscriber = (event: IDomainEvent) => Promise<void> | void;

export class TransactionalOutbox {
  private outboxRecords: OutboxRecord[] = [];
  private subscribers: Map<string, EventSubscriber[]> = new Map();

  public append(event: IDomainEvent): void {
    this.outboxRecords.push({
      id: event.eventId,
      event,
      published: false,
    });
  }

  public subscribe(eventType: string, handler: EventSubscriber): void {
    const existing = this.subscribers.get(eventType) ?? [];
    existing.push(handler);
    this.subscribers.set(eventType, existing);
  }

  /**
   * Simulates Change Data Capture (CDC / Debezium) streaming events to Kafka consumers
   */
  public async relayEvents(): Promise<number> {
    const unpublished = this.outboxRecords.filter((r) => !r.published);
    let count = 0;

    for (const record of unpublished) {
      const handlers = this.subscribers.get(record.event.eventType) ?? [];
      const wildcardHandlers = this.subscribers.get('*') ?? [];
      const allHandlers = [...handlers, ...wildcardHandlers];

      for (const handler of allHandlers) {
        await handler(record.event);
      }

      record.published = true;
      record.publishedAt = new Date();
      count++;
    }

    return count;
  }

  public getUnpublishedCount(): number {
    return this.outboxRecords.filter((r) => !r.published).length;
  }

  public getPublishedEvents(): readonly OutboxRecord[] {
    return this.outboxRecords.filter((r) => r.published);
  }
}
