export type EntityKind = "character" | "sect";

export interface Image {
  url: string;
  theme: string;
  tags: string[];
  comment?: string;
}

export interface Entity {
  type: EntityKind;
  images: Image[];
}

/** 从远程 `images.json` 动态加载的开放实体索引。 */
export interface ImageIndex {
  schemaVersion: 2;
  data: {
    entities: Record<string, Entity>;
  };
}
