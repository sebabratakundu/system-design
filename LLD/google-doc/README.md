# Google Docs LLD Requirements

## 1. Functional Requirements

- User can create multiple documents and store them.
- Each document can have multiple sections and paragraphs.
- Users can edit, delete, and format the content of the paragraphs and sections.
- Users can share their documents with other users with different permission levels (Read/Write).
- Users can view the documents shared with them.
- Real-time collaborative editing between multiple users on the same document.
- Users can see cursors and changes from other users in real-time.

## 4. Design & Architecture

### 1. Document Class

- Content[] content
- append(Content content)
- getContent(): Content[]

### 2. Document Renderer Class

- render(Document document)

### 3. Abstract TextContent Class or Interface

- Number size
- Enum fontFamily
- Enum fontWeight
- Enum type
- String content
- render()

### 4. HeaderContent Class extends TextContent

### 5. ParagraphContent Class extends TextContent

### 6. StorageServiceClass

- IStore store
- save(Document document)

### 7. Storage Interface

- type
- store
- save(Document document)
- getAll()
- getById(id)

### 8. In-Memory Storage Class implements Storage

### 9. DB Storage class implements Storage

## Flow

```js
const documentRenderer = new DocumentRenderer();
const document = new Document();

const header1 = new HeaderContent(
  "This is header 1",
  "h1",
  "sans-serif",
  "bold",
);
document.append(header1);

const para = new ParagraphContent("This is new para");
document.append(para);

documentRenderer.render(document);

const inMemStorage = new InMemStorage({
  maxLimit: 200,
});
const storageService = new StorageService(inMemStorage);

storageService.save(document);
```
