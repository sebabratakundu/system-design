import { randomUUID } from "node:crypto";
import { Cart } from "./Cart";

export class User {
  public readonly id: string;
  public readonly cart: Cart;

  constructor(
    public name: string,
    public email: string,
    public address: string
  ) {
    this.id = randomUUID();
    this.cart = new Cart();
  }

  public updateAddress(newAddress: string): void {
    this.address = newAddress;
  }
}
