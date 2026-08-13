import type { Entity, Image, ImageIndex } from "./types.js";

/** 按实体名查询实体；只认自有属性，`constructor`、`__proto__` 等原型链名称不会命中。 */
export function getEntity(index: ImageIndex, name: string): Entity | undefined {
  const { entities } = index.data;
  return Object.hasOwn(entities, name) ? entities[name] : undefined;
}

/** 返回实体的全部图片（schema 保证至少一张，保持构建时的展示顺序）。 */
export function getImages(entity: Entity): readonly [Image, ...Image[]] {
  return entity.images;
}

/** 返回某实体在指定主题分类下的图片。 */
export function imagesForTheme(
  index: ImageIndex,
  name: string,
  theme: string,
): Image[] {
  return getEntity(index, name)?.images.filter((image) => image.theme === theme) ?? [];
}

/** 返回实体的第一张图片（schema 保证实体至少一张图片，因此稳定返回）。 */
export function firstImage(entity: Entity): Image {
  return entity.images[0];
}

/** 链式查询入口：`query(index).entity("白薇").theme("default").first()`。 */
export function query(index: ImageIndex): ImageQuery {
  return new ImageQuery(index);
}

/** 不可变的链式查询构建器；每一步都返回新实例。 */
export class ImageQuery {
  constructor(
    private readonly index: ImageIndex,
    private readonly name?: string,
    private readonly themeFilter?: string,
  ) {}

  /** 选择实体；实体不存在时查询结果为空。 */
  entity(name: string): ImageQuery {
    return new ImageQuery(this.index, name, this.themeFilter);
  }

  /** 按主题过滤图片；主题是开放字符串。 */
  theme(theme: string): ImageQuery {
    return new ImageQuery(this.index, this.name, theme);
  }

  /** 返回当前筛选下的全部图片；实体不存在时为空数组。 */
  all(): readonly Image[] {
    const images =
      this.name === undefined
        ? undefined
        : this.themeFilter === undefined
          ? getEntity(this.index, this.name)?.images
          : imagesForTheme(this.index, this.name, this.themeFilter);
    return images ?? [];
  }

  /** 返回当前筛选下的第一张图片；实体不存在时返回 undefined。 */
  first(): Image | undefined {
    return this.all()[0];
  }

  /** 返回当前筛选下图片 URL 的 legacy 拼接串（`url1|url2`）；无图片时为空串。 */
  legacy(): string {
    return this.all()
      .map((image) => image.url)
      .join("|");
  }
}
