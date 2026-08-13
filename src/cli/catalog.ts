import * as fs from "node:fs";
import * as path from "node:path";
import { parse as parseToml } from "smol-toml";
import * as z from "zod";

import {
  CharacterSourceSchema,
  SectSourceSchema,
  ThemeSourceSchema,
  type SourceImage,
  CHARACTER_POOLS,
  SECT_POOL,
} from "./source-schema.js";
import { NameSchema } from "../sdk/schema.js";
import type { EntityKind } from "../sdk/types.js";

/** 包含源文件上下文的构建错误。 */
export class BuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BuildError";
  }
}

export interface CatalogEntity {
  kind: EntityKind;
  pools: Record<string, SourceImage[]>;
  origins: Record<string, string>;
}

export interface Catalog {
  entities: Map<string, CatalogEntity>;
  themes: string[];
}

/** 按 Unicode 码点做字典序比较，与 Python `sorted` 对字符串的行为一致。 */
export function compareCodePoints(a: string, b: string): number {
  const left = Array.from(a);
  const right = Array.from(b);
  const length = Math.min(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const lc = left[i]!.codePointAt(0)!;
    const rc = right[i]!.codePointAt(0)!;
    if (lc !== rc) return lc - rc;
  }
  return left.length - right.length;
}

function zodDetails(error: z.ZodError): string {
  return z.prettifyError(error);
}

function sourceFiles(root: string, directory: string): string[] {
  const sourceDir = path.join(root, "data", directory);
  if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
    throw new BuildError(`缺少数据目录: ${sourceDir}`);
  }
  return fs
    .readdirSync(sourceDir)
    .filter((name) => name.endsWith(".toml"))
    .sort(compareCodePoints)
    .map((name) => path.join(sourceDir, name));
}

function loadSource<Schema extends z.ZodType>(
  filePath: string,
  schema: Schema,
): z.output<Schema> {
  let data: unknown;
  try {
    data = parseToml(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new BuildError(`${filePath}: 非法 TOML: ${(error as Error).message}`);
  }
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new BuildError(`${filePath}: TOML 格式错误: ${zodDetails(result.error)}`);
  }
  return result.data;
}

function sourceName(filePath: string): string {
  const stem = path.basename(filePath, ".toml");
  const result = NameSchema.safeParse(stem);
  if (!result.success) {
    throw new BuildError(`${filePath}: 非法文件名: ${zodDetails(result.error)}`);
  }
  return result.data;
}

function firstDuplicate(values: string[]): string | undefined {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return undefined;
}

/** 应用主题根级默认值：comment 缺省回退；tags 未声明回退根级、显式空退出、非空并集去重（根级在前）。 */
function resolveImage(
  source: SourceImage,
  comment: string | undefined,
  tags: string[],
): SourceImage {
  let mergedTags: string[];
  if (source.tags === undefined) {
    mergedTags = [...tags];
  } else if (source.tags.length > 0) {
    mergedTags = [...new Set([...tags, ...source.tags])];
  } else {
    mergedTags = [];
  }
  return {
    url: source.url,
    comment: source.comment !== undefined ? source.comment : comment,
    tags: mergedTags,
  };
}

interface AddOptions {
  name: string;
  kind: EntityKind;
  pool: string;
  images: SourceImage[];
  source: string;
}

function add(catalog: Catalog, options: AddOptions): void {
  const { name, kind, pool, images, source } = options;
  const duplicate = firstDuplicate(images.map((image) => image.url));
  if (duplicate) {
    throw new BuildError(`${source}: 实体 [${name}] 的池 [${pool}] 存在重复 URL: ${duplicate}`);
  }

  let entity = catalog.entities.get(name);
  if (!entity) {
    entity = { kind, pools: {}, origins: {} };
    catalog.entities.set(name, entity);
  }
  if (entity.kind !== kind) {
    throw new BuildError(`实体 [${name}] 被同时声明为 ${entity.kind} 与 ${kind}，命名冲突`);
  }
  const previous = entity.origins[pool];
  if (previous) {
    throw new BuildError(`${source} 与 ${previous} 重复定义了 [${name}] 的池 [${pool}]`);
  }
  entity.pools[pool] = images;
  entity.origins[pool] = source;
}

export function loadCatalog(root: string): Catalog {
  const catalog: Catalog = { entities: new Map(), themes: [] };

  for (const filePath of sourceFiles(root, "character")) {
    const source = loadSource(filePath, CharacterSourceSchema);
    const name = sourceName(filePath);
    for (const pool of CHARACTER_POOLS) {
      const images = source.images[pool];
      if (images) {
        add(catalog, { name, kind: "character", pool, images, source: filePath });
      }
    }
  }

  for (const filePath of sourceFiles(root, "sect")) {
    const source = loadSource(filePath, SectSourceSchema);
    add(catalog, {
      name: sourceName(filePath),
      kind: "sect",
      pool: SECT_POOL,
      images: source.images.map,
      source: filePath,
    });
  }

  for (const filePath of sourceFiles(root, "themes")) {
    const theme = sourceName(filePath);
    if ((CHARACTER_POOLS as readonly string[]).includes(theme)) {
      throw new BuildError(`${filePath}: 主题名 [${theme}] 与固定图片分类重名`);
    }
    const source = loadSource(filePath, ThemeSourceSchema);
    catalog.themes.push(theme);
    if (!source.characters) continue;
    for (const [name, character] of Object.entries(source.characters)) {
      const images = character.images.map((image) =>
        resolveImage(image, source.comment, source.tags ?? []),
      );
      add(catalog, { name, kind: "character", pool: theme, images, source: filePath });
    }
  }

  if (catalog.entities.size === 0) {
    throw new BuildError("未找到任何图片数据");
  }
  return catalog;
}
