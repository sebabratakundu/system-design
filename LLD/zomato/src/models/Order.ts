import { randomUUID } from "node:crypto";
import { OrderStatus, OrderType } from "../types";
import { Cart } from "./Cart";
import { MenuItem } from "./MenuItem";
import { Restaurant } from "./Restaurant";
import { User } from "./User";

export abstract class Order {
  public readonly id: string;
  public readonly createdAt: Date;
  public readonly itemsSnapshot: MenuItem[];
  public readonly totalAmount: number;
  public readonly restaurant: Restaurant;
  private _status: OrderStatus;

  constructor(
    public readonly user: User,
    cart: Cart,
    public readonly type: OrderType
  ) {
    if (cart.getItems().length === 0) {
      throw new Error("Cannot place an order with an empty cart.");
    }

    this.id = randomUUID();
    this.createdAt = new Date();
    this.restaurant = cart.getRestaurant();
    this.itemsSnapshot = [...cart.getItems()];
    this.totalAmount = cart.getTotalAmount();
    this._status = OrderStatus.CREATED;
  }

  get status(): OrderStatus {
    return this._status;
  }

  public updateStatus(newStatus: OrderStatus): void {
    console.log(`📦 [Order ${this.id.substring(0, 8)}] Status changed: ${this._status} ➡️ ${newStatus}`);
    this._status = newStatus;
  }

  public markAsPaid(): void {
    this.updateStatus(OrderStatus.PAID);
  }
}

export class DeliveryOrder extends Order {
  constructor(user: User, cart: Cart, public readonly deliveryAddress: string) {
    super(user, cart, OrderType.DELIVERY);
  }
}

export class PickupOrder extends Order {
  constructor(user: User, cart: Cart) {
    super(user, cart, OrderType.SELF_PICKUP);
  }
}
