import { ImageIndexSchema, SCHEMA_VERSION } from "./schema.js";
import type { ImageIndex } from "./types.js";

export { ImageIndexSchema, SCHEMA_VERSION };

/** 解析并校验从 URL 动态加载的 `images.json`。 */
export function parseImages(input: unknown): ImageIndex {
  const data: unknown = typeof input === "string" ? JSON.parse(input) : input;
  return ImageIndexSchema.parse(data);
}
