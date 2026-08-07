import { Order } from "../models/Order";
import { IPaymentStrategy, PaymentResult } from "../types";

export class CreditCardPaymentStrategy implements IPaymentStrategy {
  public readonly providerName = "Credit Card Gateway";

  constructor(
    private cardNumber: string,
    private cvv: string,
    private expiry: string
  ) {
    if (!this.validateCardNumber(cardNumber)) {
      throw new Error("Invalid Credit Card Number.");
    }
  }

  private validateCardNumber(num: string): boolean {
    const cleanNum = num.replace(/\s+/g, "");
    return /^\d{13,19}$/.test(cleanNum);
  }

  validate(order: Order): boolean {
    return order.totalAmount > 0 && this.validateCardNumber(this.cardNumber);
  }

  async process(order: Order): Promise<PaymentResult> {
    if (!this.validate(order)) {
      return {
        orderId: order.id,
        isSuccess: false,
        message: "Credit Card validation failed.",
        amount: order.totalAmount,
        provider: this.providerName,
        timestamp: new Date(),
      };
    }

    await new Promise((resolve) => setTimeout(resolve, 100));

    const maskedCard = `****-****-****-${this.cardNumber.slice(-4)}`;
    const txId = `CC_TXN_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    order.markAsPaid();

    return {
      orderId: order.id,
      isSuccess: true,
      message: `Payment of ₹${order.totalAmount} successful via Card (${maskedCard})`,
      amount: order.totalAmount,
      provider: this.providerName,
      transactionId: txId,
      timestamp: new Date(),
    };
  }
}
