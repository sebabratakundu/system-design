import { MenuItem } from "./MenuItem";
import { Restaurant } from "./Restaurant";

export class CrossRestaurantError extends Error {
  constructor() {
    super("Your cart contains items from another restaurant. Please clear your cart first.");
    this.name = "CrossRestaurantError";
  }
}

export class Cart {
  private restaurant: Restaurant | null = null;
  private items: MenuItem[] = [];

  public setRestaurant(restaurant: Restaurant): void {
    if (this.restaurant && this.restaurant.id !== restaurant.id) {
      if (this.items.length > 0) {
        throw new CrossRestaurantError();
      }
    }
    this.restaurant = restaurant;
  }

  public getRestaurant(): Restaurant {
    if (!this.restaurant) {
      throw new Error("No restaurant selected for cart.");
    }
    return this.restaurant;
  }

  public addToCart(item: MenuItem, restaurant: Restaurant): void {
    this.setRestaurant(restaurant);

    if (!restaurant.hasItem(item.id)) {
      throw new Error(`Item '${item.name}' does not belong to restaurant '${restaurant.name}'.`);
    }

    if (!item.isAvailable) {
      throw new Error(`Item '${item.name}' is currently unavailable.`);
    }

    this.items.push(item);
  }

  public removeItem(itemId: string): void {
    this.items = this.items.filter((item) => item.id !== itemId);
    if (this.items.length === 0) {
      this.restaurant = null;
    }
  }

  public clearCart(): void {
    this.items = [];
    this.restaurant = null;
  }

  public getItems(): readonly MenuItem[] {
    return [...this.items];
  }

  public getTotalAmount(): number {
    return this.items.reduce((total, item) => total + item.price, 0);
  }

  public getSummary(): string {
    const restaurantName = this.restaurant ? this.restaurant.name : "None";
    return `Restaurant: ${restaurantName} | Items: ${this.items.length} | Total: ₹${this.getTotalAmount()}`;
  }
}
