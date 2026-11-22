declare module "heic-decode" {
  export type DecodedHeic = {
    width: number;
    height: number;
    data: Uint8ClampedArray;
  };
  export default function decodeHeic(options: { buffer: Buffer | Uint8Array }): Promise<DecodedHeic>;
}
