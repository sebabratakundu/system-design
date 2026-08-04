import { IDocument } from "./Document";

export class DocumentRenderer {
  render(document: IDocument) {
    console.log("-------------------");
    console.log(document.getTitle());
    console.log("-------------------");
    document.getContent().forEach((content) => {
      console.log(content.render());
    });
  }
}
