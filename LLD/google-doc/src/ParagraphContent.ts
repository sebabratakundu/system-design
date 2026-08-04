import { FontFamilyType, FontWeightType, ITextContent } from "./types";

export class ParagraphContent implements ITextContent {
  readonly content;
  readonly fontSize;
  readonly fontFamily;
  readonly fontWeight;
  readonly type: "p" | "span";

  constructor(
    content: string,
    type: "p" | "span",
    fontFamily: FontFamilyType,
    fontWeight: FontWeightType,
    fontSize: number,
  ) {
    this.content = content;
    this.type = type;
    this.fontSize = fontSize;
    this.fontFamily = fontFamily;
    this.fontWeight = fontWeight;
  }

  render(): string {
    return `<${this.type}>${this.content}</${this.type}>`;
  }
}
