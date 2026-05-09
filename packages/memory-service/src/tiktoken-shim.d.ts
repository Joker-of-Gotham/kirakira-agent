declare module "tiktoken" {
  export function encodingForModel(model: string): {
    encode(text: string): { length: number } & ArrayLike<number>;
    free?: () => void;
  };
}
