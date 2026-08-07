import { Order } from "./models/Order";

export type PaymentResult = {
  orderId: string;
  isSuccess: boolean;
  message: string;
  provider: string;
  amount: number;
  transactionId?: string;
  timestamp: Date;
};

export interface IPaymentStrategy {
  readonly providerName: string;
  process(order: Order): Promise<PaymentResult>;
  validate(order: Order): boolean;
}

export enum OrderStatus {
  CREATED = "CREATED",
  PAID = "PAID",
  PREPARING = "PREPARING",
  OUT_FOR_DELIVERY = "OUT_FOR_DELIVERY",
  DELIVERED = "DELIVERED",
  CANCELLED = "CANCELLED",
}

export enum OrderType {
  DELIVERY = "DELIVERY",
  SELF_PICKUP = "SELF_PICKUP",
}
