import { Order } from "../models/Order";
import { IPaymentStrategy, PaymentResult } from "../types";

export class UpiPaymentStrategy implements IPaymentStrategy {
  public readonly providerName = "UPI (Unified Payments Interface)";

  constructor(private upiId: string) {
    if (!this.validateUpiId(upiId)) {
      throw new Error(`Invalid UPI VPA ID '${upiId}'`);
    }
  }

  private validateUpiId(id: string): boolean {
    return /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(id);
  }

  validate(order: Order): boolean {
    return order.totalAmount > 0 && this.validateUpiId(this.upiId);
  }

  async process(order: Order): Promise<PaymentResult> {
    if (!this.validate(order)) {
      return {
        orderId: order.id,
        isSuccess: false,
        message: "UPI Payment validation failed",
        amount: order.totalAmount,
        provider: this.providerName,
        timestamp: new Date(),
      };
    }

    // Simulate UPI processing gateway latency
    await new Promise((resolve) => setTimeout(resolve, 80));

    const txId = `UPI_TXN_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    order.markAsPaid();

    return {
      orderId: order.id,
      isSuccess: true,
      message: `Payment of ₹${order.totalAmount} successful via UPI VPA ${this.upiId}`,
      amount: order.totalAmount,
      provider: this.providerName,
      transactionId: txId,
      timestamp: new Date(),
    };
  }
}
