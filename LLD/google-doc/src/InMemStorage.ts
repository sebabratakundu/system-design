import { IDocument } from "./Document";
import { IStorage } from "./types";

export class InMemStorage implements IStorage {
  #store: Map<string, IDocument>;
  constructor(size: number) {
    this.#store = new Map();
  }

  delete(id: string): void {
    this.#store.delete(id);
  }

  save(document: IDocument): void {
    this.#store.set(document.getId(), document);
  }

  getAll() {
    return Array.from(this.#store.values());
  }

  getById(id: string) {
    return this.#store.get(id);
  }
}
