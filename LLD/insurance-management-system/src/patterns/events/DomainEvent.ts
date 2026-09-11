import { randomUUID } from 'crypto';

export interface IDomainEvent<TPayload = unknown> {
  readonly eventId: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly payload: TPayload;
  readonly partitionKey: string;
  readonly occurredAt: Date;
}

export class DomainEvent<TPayload = unknown> implements IDomainEvent<TPayload> {
  public readonly eventId: string;
  public readonly aggregateType: string;
  public readonly aggregateId: string;
  public readonly eventType: string;
  public readonly payload: TPayload;
  public readonly partitionKey: string;
  public readonly occurredAt: Date;

  constructor(params: {
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload: TPayload;
    partitionKey?: string;
  }) {
    this.eventId = randomUUID();
    this.aggregateType = params.aggregateType;
    this.aggregateId = params.aggregateId;
    this.eventType = params.eventType;
    this.payload = params.payload;
    this.partitionKey = params.partitionKey ?? params.aggregateId;
    this.occurredAt = new Date();
  }
}
