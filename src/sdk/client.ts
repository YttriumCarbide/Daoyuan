import { ImageIndexSchema } from "./schema.js";
import type { Entity, EntityName, Image, ImageIndex, ImageTheme } from "./types.js";

/** 解析并校验 `images.json` 的结构，返回当前发布快照的静态类型。 */
export function parseImages(input: unknown): ImageIndex {
  const data: unknown = typeof input === "string" ? JSON.parse(input) : input;
  return ImageIndexSchema.parse(data);
}

/** 按已发布实体名查询实体。 */
export function getEntity(index: ImageIndex, name: EntityName): Entity | undefined {
  return index.data.entities[name];
}

/** 返回实体的全部图片（保持构建时的展示顺序）。 */
export function getImages(entity: Entity): Image[] {
  return entity.images;
}

/** 返回某实体在已发布主题分类下的图片。 */
export function imagesForTheme(
  index: ImageIndex,
  name: EntityName,
  theme: ImageTheme,
): Image[] {
  return getEntity(index, name)?.images.filter((image) => image.theme === theme) ?? [];
}

/** 返回实体的第一张图片（展示优先级最高）。 */
export function firstImage(entity: Entity): Image | undefined {
  return entity.images[0];
}
