import { OrderFactory } from "./factories/OrderFactory";
import { RestaurantManager } from "./managers/RestaurantManager";
import { MenuItem } from "./models/MenuItem";
import { Order } from "./models/Order";
import { Restaurant } from "./models/Restaurant";
import { User } from "./models/User";
import { PaymentProcessor } from "./processors/PaymentProcessor";
import { IPaymentStrategy, OrderType, PaymentResult } from "./types";

/**
 * ZomatoClient (Application Facade Pattern)
 * Simplifies interactions between Users, Restaurant Catalog, Carts, Orders, and Payments.
 */
export class ZomatoClient {
  private restaurantManager: RestaurantManager;
  private orderFactory: OrderFactory;

  constructor() {
    this.restaurantManager = RestaurantManager.getInstance();
    this.orderFactory = new OrderFactory();
  }

  public registerRestaurant(name: string, location: string): Restaurant {
    const restaurant = new Restaurant(name, location);
    this.restaurantManager.addRestaurant(restaurant);
    return restaurant;
  }

  public searchRestaurants(locationQuery: string): Restaurant[] {
    return this.restaurantManager.searchByLocation(locationQuery);
  }

  public createUser(name: string, email: string, address: string): User {
    return new User(name, email, address);
  }

  public addItemToCart(user: User, restaurant: Restaurant, item: MenuItem): void {
    user.cart.addToCart(item, restaurant);
    console.log(`🛒 [Cart Updated] User '${user.name}' added '${item.name}' (₹${item.price}) from '${restaurant.name}'`);
  }

  public async placeAndPayOrder(
    user: User,
    orderType: OrderType,
    paymentStrategy: IPaymentStrategy,
    deliveryAddress?: string
  ): Promise<{ order: Order; paymentResult: PaymentResult }> {
    // 1. Factory creates the appropriate Order instance
    const order = this.orderFactory.createOrder(
      user,
      user.cart,
      orderType,
      deliveryAddress
    );

    console.log(`📋 [Order Created] Order ID: ${order.id.substring(0, 8)} | Type: ${order.type} | Total: ₹${order.totalAmount}`);

    // 2. Process Payment via Strategy Pattern
    const paymentProcessor = new PaymentProcessor(paymentStrategy);
    const paymentResult = await paymentProcessor.processPayment(order);

    if (paymentResult.isSuccess) {
      // 3. Clear user's cart on successful order placement
      user.cart.clearCart();
    }

    return { order, paymentResult };
  }
}
