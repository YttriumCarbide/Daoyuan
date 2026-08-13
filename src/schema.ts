import { z } from "zod";

/** JSON Schema 方言与 `$id` 基础。 */
export const SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema";
export const SCHEMA_VERSION = 2 as const;
export const CHARACTER_POOLS = ["default", "female", "special"] as const;
export const SECT_POOL = "map" as const;

export const URL_PATTERN = /^https:\/\/[^\s|]+$/;
export const TEXT_PATTERN = /^\S(?:[\s\S]*\S)?$/;

/** 非空、无首尾空白、长度 1..100 的开放字符串。 */
export const NameSchema = z.string().min(1).max(100).regex(TEXT_PATTERN);
export type Name = z.infer<typeof NameSchema>;

/** 非空、无首尾空白、长度 1..500 的文本。 */
export const TextSchema = z
  .string()
  .min(1)
  .max(500)
  .regex(TEXT_PATTERN)
  .describe("不能为空或以空白开头、结尾。");
export type Text = z.infer<typeof TextSchema>;

/** 非空、无首尾空白、长度 1..100 的标签。 */
export const TagSchema = z.string().min(1).max(100).regex(TEXT_PATTERN);
export type Tag = z.infer<typeof TagSchema>;

export const EntityKindSchema = z.enum(["character", "sect"]);
export type EntityKind = z.infer<typeof EntityKindSchema>;

function uniqueTags(tags: string[]): boolean {
  return new Set(tags).size === tags.length;
}

/** TOML 中的一张图片。 */
export const SourceImageSchema = z
  .object({
    url: z
      .string()
      .regex(URL_PATTERN)
      .describe("必须以 https:// 开头，且不能包含空白或 |。"),
    comment: TextSchema.optional(),
    tags: z.array(TagSchema).refine(uniqueTags, "tags 不能包含重复值").optional(),
  })
  .strict()
  .describe("TOML 中的一张图片。");
export type SourceImage = z.infer<typeof SourceImageSchema>;

/** 非空图片数组。 */
export const SourceImagesSchema = z.array(SourceImageSchema).min(1);
export type SourceImages = z.infer<typeof SourceImagesSchema>;

/** 人物的三个固定图片分类。 */
export const CharacterImagePoolsSchema = z
  .object({
    default: SourceImagesSchema.optional(),
    female: SourceImagesSchema.optional(),
    special: SourceImagesSchema.optional(),
  })
  .strict()
  .refine((pools) => Object.keys(pools).length > 0, "至少需要一个图片分类");
export type CharacterImagePools = z.infer<typeof CharacterImagePoolsSchema>;

/** `data/character/<name>.toml` 的根类型。 */
export const CharacterSourceSchema = z
  .object({
    images: CharacterImagePoolsSchema,
  })
  .strict()
  .describe("`data/character/<name>.toml` 的根类型。");
export type CharacterSource = z.infer<typeof CharacterSourceSchema>;

/** `data/sect/<name>.toml` 的根类型。 */
export const SectSourceSchema = z
  .object({
    images: z.object({ map: SourceImagesSchema }).strict(),
  })
  .strict()
  .describe("`data/sect/<name>.toml` 的根类型。");
export type SectSource = z.infer<typeof SectSourceSchema>;

/** `data/themes/<theme>.toml` 的根类型。 */
export const ThemeSourceSchema = z
  .object({
    description: TextSchema.optional(),
    comment: TextSchema.optional(),
    tags: z.array(TagSchema).refine(uniqueTags, "tags 不能包含重复值").optional(),
    characters: z
      .record(NameSchema, z.object({ images: SourceImagesSchema }).strict())
      .refine((characters) => Object.keys(characters).length > 0, "characters 不能为空")
      .optional(),
  })
  .strict()
  .refine(
    (source) => Boolean(source.description || source.comment || source.characters),
    "至少需要 description、comment 或 characters 之一",
  )
  .describe("`data/themes/<theme>.toml` 的根类型。");
export type ThemeSource = z.infer<typeof ThemeSourceSchema>;

/** `images.json` 中的一张图片。 */
export const ImageSchema = z
  .object({
    url: z.string().regex(URL_PATTERN),
    theme: NameSchema,
    tags: z.array(TagSchema).refine(uniqueTags, "tags 不能包含重复值"),
    comment: TextSchema.optional(),
  })
  .strict()
  .describe("`images.json` 中的一张图片。");
export type Image = z.infer<typeof ImageSchema>;

export const EntitySchema = z
  .object({
    type: EntityKindSchema,
    images: z.array(ImageSchema).min(1),
  })
  .strict();
export type Entity = z.infer<typeof EntitySchema>;

/** `images.json` 的根类型。 */
export const ImageIndexSchema = z
  .object({
    schemaVersion: z.literal(2),
    data: z
      .object({
        entities: z
          .record(NameSchema, EntitySchema)
          .refine((entities) => Object.keys(entities).length > 0, "entities 不能为空"),
      })
      .strict(),
  })
  .strict()
  .describe("`images.json` 的根类型。");
export type ImageIndex = z.infer<typeof ImageIndexSchema>;
