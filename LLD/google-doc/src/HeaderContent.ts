import { FontFamilyType, FontWeightType, ITextContent } from "./types";

export class HeaderContent implements ITextContent {
  readonly content;
  readonly fontSize;
  readonly fontFamily;
  readonly fontWeight;
  readonly type: "h1" | "h2" | "h3" | "h4";

  constructor(
    content: string,
    type: "h1" | "h2" | "h3" | "h4",
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
