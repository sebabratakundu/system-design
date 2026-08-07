import { randomUUID } from "node:crypto";

export class MenuItem {
  public readonly id: string;

  constructor(
    public readonly name: string,
    public readonly price: number,
    public readonly description: string = "",
    public isAvailable: boolean = true
  ) {
    if (price <= 0) {
      throw new Error(`Invalid price ${price} for MenuItem '${name}'`);
    }
    this.id = randomUUID();
  }
}
