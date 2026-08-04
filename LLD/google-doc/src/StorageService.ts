import { IDocument } from "./Document";
import { IStorage } from "./types";

export interface IStorageService {
  save(document: IDocument): void;
  delete(id: string): void;
  get(id: string): IDocument | undefined;
  getAll(): IDocument[];
}

export class StorageService implements IStorageService {
  constructor(private storage: IStorage) {}

  save(document: IDocument): void {
    this.storage.save(document);
  }
  delete(id: string): void {
    this.storage.delete(id);
  }
  get(id: string) {
    return this.storage.getById(id);
  }
  getAll(): IDocument[] {
    return this.storage.getAll();
  }
}
