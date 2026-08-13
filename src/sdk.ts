import { ImageIndexSchema, type Entity, type Image, type ImageIndex } from "./schema.js";

/** 解析并校验 `images.json`（可传 JSON 字符串或已解析对象）。 */
export function parseImages(input: string | unknown): ImageIndex {
  const data: unknown = typeof input === "string" ? JSON.parse(input) : input;
  return ImageIndexSchema.parse(data);
}

/** 按实体名查询实体。 */
export function getEntity(index: ImageIndex, name: string): Entity | undefined {
  return index.data.entities[name];
}

/** 返回实体的全部图片（保持构建时的展示顺序）。 */
export function getImages(entity: Entity): Image[] {
  return entity.images;
}

/** 返回某实体在某主题分类下的图片。 */
export function imagesForTheme(index: ImageIndex, name: string, theme: string): Image[] {
  return getEntity(index, name)?.images.filter((image) => image.theme === theme) ?? [];
}

/** 返回实体的第一张图片（展示优先级最高）。 */
export function firstImage(entity: Entity): Image | undefined {
  return entity.images[0];
}
