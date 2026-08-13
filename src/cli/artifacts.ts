import * as fs from "node:fs";
import * as path from "node:path";
import * as z from "zod";

import { BuildError, compareCodePoints, type Catalog, type CatalogEntity } from "./catalog.js";
import {
  CHARACTER_POOLS,
  SECT_POOL,
  CharacterSourceSchema,
  SectSourceSchema,
  ThemeSourceSchema,
  type SourceImage,
} from "./source-schema.js";
import {
  SCHEMA_DIALECT,
  RuntimeImageIndexSchema,
  type RuntimeEntity,
  type RuntimeImage,
  type RuntimeImageIndex,
} from "../sdk/schema.js";

const LEGACY_SECTIONS: Record<string, string> = {
  default: "charPortraits",
  female: "charPortraitsFemale",
  special: "specialPortraits",
  wedding: "weddingPortraits",
  tarot: "TarotPortraits",
};
const LEGACY_THEME_ORDER = ["wedding", "tarot"];
const LEGACY_SECT_GROUPS: Record<string, string[]> = {
  玄天界: [
    "大周仙朝",
    "南梁古国",
    "蜀山剑门",
    "昆仑道门",
    "桃花宗",
    "万法宗",
    "合欢宗",
    "天机阁",
    "星道宗",
    "湮丹宗",
    "灵墟宗",
    "青玉宗",
    "符韵门",
    "阵天宗",
    "广寒宫",
    "蛟龙一族",
    "太阳神宫",
    "尸魔宗",
    "黑金阁",
    "万魂殿",
    "神猿族",
    "九尾天狐族",
    "五色孔雀族",
    "柳蛇族",
    "大雷音寺",
    "冥煞玄蛇",
    "嗜血鬼藤",
    "残缺剑傀",
    "霜骨冰蛟",
    "亚种虚空兽",
    "蜃灵皇残魂",
    "怨念尸魔",
    "渡魂诡灵",
    "天道灾兽化身",
    "血神宫",
  ],
  九天仙界: [
    "天庭",
    "云上瑶池",
    "阴煞宗",
    "散仙秘境",
    "地府入口",
    "太古王族",
    "极乐宗",
    "玉灵宫",
    "万妖古界",
    "先天仙灵域",
    "剑修联盟",
    "真灵世家",
    "天庭前线",
  ],
};

interface SchemaSpec {
  schema: z.ZodType;
  id: string;
  title: string;
}

const SCHEMAS: Record<"character" | "sect" | "theme" | "output", SchemaSpec> = {
  character: {
    schema: CharacterSourceSchema,
    id: "urn:daoyuan:schema:images:character:v2",
    title: "Daoyuan Character Image Sources",
  },
  sect: {
    schema: SectSourceSchema,
    id: "urn:daoyuan:schema:images:sect:v2",
    title: "Daoyuan Sect Image Sources",
  },
  theme: {
    schema: ThemeSourceSchema,
    id: "urn:daoyuan:schema:images:theme:v2",
    title: "Daoyuan Theme Image Sources",
  },
  output: {
    schema: RuntimeImageIndexSchema,
    id: "urn:daoyuan:schema:images:v2",
    title: "Daoyuan Images",
  },
};

export class ProjectPaths {
  constructor(readonly root: string) {}

  get schemas(): Record<string, string> {
    return {
      character: path.join(this.root, "schema", "character.schema.json"),
      sect: path.join(this.root, "schema", "sect.schema.json"),
      theme: path.join(this.root, "schema", "theme.schema.json"),
      output: path.join(this.root, "images.schema.json"),
    };
  }

  get images(): string {
    return path.join(this.root, "images.json");
  }

  get portraits(): string {
    return path.join(this.root, "portraits.json");
  }

  get sectMaps(): string {
    return path.join(this.root, "sect-maps.json");
  }
}

export interface Build {
  artifacts: Record<string, string>;
  entityCount: number;
  warnings: string[];
}

function toOutputImage(source: SourceImage, theme: string): RuntimeImage {
  return {
    url: source.url,
    theme,
    tags: source.tags ?? [],
    comment: source.comment,
  };
}

/** 实体至少一张图片由最终 schema 保证；空实体会在构建时提前报错。 */
function toImages(images: RuntimeImage[], name: string): [RuntimeImage, ...RuntimeImage[]] {
  const [first, ...rest] = images;
  if (first === undefined) throw new Error(`实体 [${name}] 没有任何图片`);
  return [first, ...rest];
}

export function buildIndex(catalog: Catalog): RuntimeImageIndex {
  const entities: Record<string, RuntimeEntity> = {};
  const names = [...catalog.entities.keys()].sort(compareCodePoints);
  for (const name of names) {
    const source = catalog.entities.get(name)!;
    const poolOrder =
      source.kind === "character" ? [...CHARACTER_POOLS, ...catalog.themes] : [SECT_POOL];
    const images: RuntimeImage[] = [];
    for (const pool of poolOrder) {
      for (const image of source.pools[pool] ?? []) {
        images.push(toOutputImage(image, pool));
      }
    }
    entities[name] = { type: source.kind, images: toImages(images, name) };
  }
  return { schemaVersion: 2, data: { entities } };
}

export function buildLegacyPortraits(
  catalog: Catalog,
): { portraits: Record<string, Record<string, string>>; warnings: string[] } {
  const portraits: Record<string, Record<string, string>> = {};
  for (const section of Object.values(LEGACY_SECTIONS)) {
    portraits[section] = {};
  }
  const unsupportedThemes = new Set<string>();
  const names = [...catalog.entities.keys()].sort(compareCodePoints);

  for (const name of names) {
    const entity = catalog.entities.get(name)!;
    if (entity.kind !== "character") continue;
    const poolOrder = [
      ...CHARACTER_POOLS,
      ...LEGACY_THEME_ORDER,
      ...catalog.themes.filter((theme) => !LEGACY_THEME_ORDER.includes(theme)),
    ];
    for (const pool of poolOrder) {
      const images = entity.pools[pool];
      if (!images || images.length === 0) continue;
      const section = LEGACY_SECTIONS[pool];
      if (!section) {
        if (!(CHARACTER_POOLS as readonly string[]).includes(pool)) {
          unsupportedThemes.add(pool);
        }
        continue;
      }
      const urls = images.map((image) => image.url).join("|");
      portraits[section]![name] = urls;
      if (pool === "wedding" || pool === "tarot") {
        const current = portraits.charPortraits![name];
        portraits.charPortraits![name] = current ? `${current}|${urls}` : urls;
      }
    }
  }

  const warnings = [...unsupportedThemes]
    .sort(compareCodePoints)
    .map((theme) => `主题池 [${theme}] 无对应 legacy 分区，已跳过`);
  return { portraits, warnings };
}

export function buildLegacySectMaps(catalog: Catalog): Record<string, Record<string, string>> {
  const sects: Record<string, CatalogEntity> = {};
  for (const [name, entity] of catalog.entities) {
    if (entity.kind === "sect") sects[name] = entity;
  }
  const groupedNames = new Set(Object.values(LEGACY_SECT_GROUPS).flat());
  const unmapped = Object.keys(sects)
    .filter((name) => !groupedNames.has(name))
    .sort(compareCodePoints);
  if (unmapped.length > 0) {
    throw new BuildError(`legacy sect-maps 类别未配置：${unmapped.join("、")}`);
  }

  const result: Record<string, Record<string, string>> = {};
  for (const [group, names] of Object.entries(LEGACY_SECT_GROUPS)) {
    result[group] = {};
    for (const name of names) {
      result[group]![name] = name in sects
        ? (sects[name]!.pools[SECT_POOL] ?? []).map((image) => image.url).join("|")
        : "";
    }
  }
  return result;
}

export function serialize(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}

export function jsonSchema(kind: "character" | "sect" | "theme" | "output"): Record<string, unknown> {
  const spec = SCHEMAS[kind];
  const generated = z.toJSONSchema(spec.schema, {
    target: "draft-2020-12",
  }) as Record<string, unknown>;
  delete generated.$schema;
  return {
    $schema: SCHEMA_DIALECT,
    $id: spec.id,
    ...generated,
    title: spec.title,
  };
}

export function buildArtifacts(paths: ProjectPaths, catalog: Catalog): Build {
  const index = buildIndex(catalog);
  const { portraits, warnings } = buildLegacyPortraits(catalog);
  const artifacts: Record<string, string> = {
    [paths.images]: serialize(index),
    [paths.portraits]: serialize(portraits),
    [paths.sectMaps]: serialize(buildLegacySectMaps(catalog)),
  };
  for (const [kind, schemaPath] of Object.entries(paths.schemas)) {
    artifacts[schemaPath] = serialize(jsonSchema(kind as keyof typeof SCHEMAS));
  }
  return {
    artifacts,
    entityCount: Object.keys(index.data.entities).length,
    warnings,
  };
}

export function staleArtifacts(build: Build): string[] {
  return Object.entries(build.artifacts)
    .filter(([filePath, content]) => {
      if (!fs.existsSync(filePath)) return true;
      return fs.readFileSync(filePath, "utf8") !== content;
    })
    .map(([filePath]) => filePath);
}

export function writeArtifacts(build: Build): void {
  for (const [filePath, content] of Object.entries(build.artifacts)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, "utf8");
  }
}
