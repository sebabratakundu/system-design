import { IDocument } from "./Document";

export type FontFamilyType = "sans-serif" | "roboto";
export type FontWeightType = 400 | 500 | 600 | 700 | 800 | 900;

export interface IContent {
  readonly content: string;
  render(): string;
}

export interface ITextContent extends IContent {
  readonly fontSize: number;
  readonly fontFamily: FontFamilyType;
  readonly fontWeight: FontWeightType;
  readonly type: string;
}

export interface IStorage {
  save(document: IDocument): void;
  getAll(): IDocument[];
  getById(id: string): IDocument | undefined;
  delete(id: string): void;
}
