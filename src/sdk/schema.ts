import * as z from "zod";

import type { ImageIndex } from "./types.js";

/** JSON Schema 方言与最终数据版本。 */
export const SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema";
export const SCHEMA_VERSION = 2 as const;

export const URL_PATTERN = /^https:\/\/[^\s|]+$/;
export const TEXT_PATTERN = /^\S(?:[\s\S]*\S)?$/;

/** 非空、无首尾空白、长度 1..100 的开放字符串。 */
export const NameSchema = z.string().min(1).max(100).regex(TEXT_PATTERN);

/** 非空、无首尾空白、长度 1..500 的文本。 */
export const TextSchema = z
  .string()
  .min(1)
  .max(500)
  .regex(TEXT_PATTERN)
  .describe("不能为空或以空白开头、结尾。");

/** 非空、无首尾空白、长度 1..100 的标签。 */
export const TagSchema = z.string().min(1).max(100).regex(TEXT_PATTERN);

/** HTTPS 图片地址；`|` 保留给 legacy 多 URL 分隔符。 */
export const UrlSchema = z
  .string()
  .regex(URL_PATTERN)
  .describe("必须以 https:// 开头，且不能包含空白或 |。");

function uniqueTags(tags: string[]): boolean {
  return new Set(tags).size === tags.length;
}

/** 标签唯一性同时声明给 Zod runtime 与生成的 JSON Schema。 */
export const TagsSchema = z
  .array(TagSchema)
  .refine(uniqueTags, "tags 不能包含重复值")
  .meta({ uniqueItems: true });

export const EntityKindSchema = z.enum(["character", "sect"]);

/** `images.json` 中的一张图片；theme 在 runtime 保持开放字符串。 */
export const ImageSchema = z
  .strictObject({
    url: UrlSchema,
    theme: NameSchema,
    tags: TagsSchema,
    comment: TextSchema.optional(),
  })
  .describe("`images.json` 中的一张图片。");

export const EntitySchema = z.strictObject({
  type: EntityKindSchema,
  images: z.array(ImageSchema).min(1),
});

const RuntimeEntitiesSchema = z
  .record(NameSchema, EntitySchema)
  .refine((entities) => Object.keys(entities).length > 0, "entities 不能为空")
  .meta({ minProperties: 1 });

/** `images.json` 的开放 runtime schema；发布快照成员只在 TypeScript 类型中收紧。 */
export const RuntimeImageIndexSchema = z
  .strictObject({
    schemaVersion: z.literal(SCHEMA_VERSION),
    data: z.strictObject({
      entities: RuntimeEntitiesSchema,
    }),
  })
  .describe("`images.json` 的根类型。");

/** 同一开放 runtime 校验器叠加当前发布快照的静态返回类型。 */
export const ImageIndexSchema = RuntimeImageIndexSchema as z.ZodType<ImageIndex>;

export type RuntimeImage = z.output<typeof ImageSchema>;
export type RuntimeEntity = z.output<typeof EntitySchema>;
export type RuntimeImageIndex = z.output<typeof RuntimeImageIndexSchema>;
