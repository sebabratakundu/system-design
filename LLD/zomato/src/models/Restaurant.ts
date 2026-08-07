import { randomUUID } from "node:crypto";
import { MenuItem } from "./MenuItem";

export class Restaurant {
  public readonly id: string;
  private menu: Map<string, MenuItem> = new Map();

  constructor(
    public readonly name: string,
    public readonly location: string
  ) {
    this.id = randomUUID();
  }

  public addMenuItem(item: MenuItem): void {
    this.menu.set(item.id, item);
  }

  public getMenu(): MenuItem[] {
    return Array.from(this.menu.values());
  }

  public getItemById(itemId: string): MenuItem | undefined {
    return this.menu.get(itemId);
  }

  public hasItem(itemId: string): boolean {
    return this.menu.has(itemId);
  }
}
