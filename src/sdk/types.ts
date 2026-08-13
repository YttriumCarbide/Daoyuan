import type { EntityName, ImageTheme } from "./generated.js";

export type { EntityName, ImageTheme } from "./generated.js";

export type EntityKind = "character" | "sect";

export interface Image {
  url: string;
  theme: ImageTheme;
  tags: string[];
  comment?: string;
}

export interface Entity {
  type: EntityKind;
  images: Image[];
}

/** 当前发布快照的精确实体索引。 */
export interface ImageIndex {
  schemaVersion: 2;
  data: {
    entities: Record<EntityName, Entity>;
  };
}
