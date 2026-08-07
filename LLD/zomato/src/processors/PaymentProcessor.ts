import { Order } from "../models/Order";
import { IPaymentStrategy, PaymentResult } from "../types";

export class PaymentProcessor {
  constructor(private strategy: IPaymentStrategy) {}

  public setStrategy(strategy: IPaymentStrategy): void {
    console.log(`🔄 [PaymentProcessor] Switched strategy to '${strategy.providerName}'`);
    this.strategy = strategy;
  }

  public async processPayment(order: Order): Promise<PaymentResult> {
    console.log(`💳 [PaymentProcessor] Processing order ${order.id.substring(0, 8)} (Total: ₹${order.totalAmount}) via ${this.strategy.providerName}...`);
    return await this.strategy.process(order);
  }
}
