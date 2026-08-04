import { IContent } from "./types";

export interface IDocument {
  append(content: IContent): void;
  getContent(): IContent[];
  getTitle(): string;
  getId(): string;
}

export class Document implements IDocument {
  #content: IContent[];

  constructor(
    private title: string,
    private id: string,
  ) {
    this.#content = [];
  }

  append(content: IContent) {
    this.#content.push(content);
  }

  getContent() {
    return this.#content;
  }

  getTitle() {
    return this.title;
  }

  getId() {
    return this.id;
  }
}
