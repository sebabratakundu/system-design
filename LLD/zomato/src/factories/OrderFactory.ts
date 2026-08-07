import { Cart } from "../models/Cart";
import { DeliveryOrder, Order, PickupOrder } from "../models/Order";
import { User } from "../models/User";
import { OrderType } from "../types";

export class OrderFactory {
  public createOrder(
    user: User,
    cart: Cart,
    orderType: OrderType,
    deliveryAddress?: string
  ): Order {
    switch (orderType) {
      case OrderType.DELIVERY: {
        const address = deliveryAddress ?? user.address;
        if (!address) {
          throw new Error("Delivery address is required for Delivery orders.");
        }
        return new DeliveryOrder(user, cart, address);
      }

      case OrderType.SELF_PICKUP:
        return new PickupOrder(user, cart);

      default: {
        const _exhaustiveCheck: never = orderType;
        throw new Error(`Invalid OrderType '${_exhaustiveCheck}'`);
      }
    }
  }
}
