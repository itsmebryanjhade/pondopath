declare module "saxen" {
  export class Parser {
    on(event: "openTag", callback: (name: string, attributes: () => Record<string, string>, decode: (value: string) => string, selfClosing: boolean) => void): this;
    on(event: "closeTag", callback: (name: string, decode: (value: string) => string, selfClosing: boolean) => void): this;
    on(event: "text", callback: (value: string, decode: (value: string) => string) => void): this;
    on(event: "error" | "warn", callback: (error: Error) => void): this;
    on(event: "attention", callback: (value: string) => void): this;
    parse(xml: string): Error | undefined;
  }
}
