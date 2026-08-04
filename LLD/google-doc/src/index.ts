import { Document } from "./Document";
import { DocumentRenderer } from "./DocumentRenderer";
import { HeaderContent } from "./HeaderContent";
import { InMemStorage } from "./InMemStorage";
import { ParagraphContent } from "./ParagraphContent";
import { StorageService } from "./StorageService";

const document = new Document("Doc 1", "1");
const documentRenderer = new DocumentRenderer();

const heading = new HeaderContent("This is my header", "h1", "roboto", 400, 4);
document.append(heading);

const para = new ParagraphContent("this is my para", "p", "sans-serif", 500, 5);
document.append(para);

documentRenderer.render(document);

const inMemStorage = new InMemStorage(200);
const storageService = new StorageService(inMemStorage);

storageService.save(document);

const doc2 = new Document("Doc 2", "2");

const head2 = new HeaderContent("This is my header 2", "h3", "roboto", 400, 4);
doc2.append(head2);

const para2 = new ParagraphContent(
  "this is my para 2",
  "p",
  "sans-serif",
  500,
  5,
);
doc2.append(para2);

documentRenderer.render(doc2);

storageService.save(doc2);

console.log(storageService.get("2")?.getContent());
