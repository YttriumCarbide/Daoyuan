import * as z from "zod";

import { NameSchema, TagsSchema, TextSchema, UrlSchema } from "../sdk/schema.js";

export const CHARACTER_POOLS = ["default", "female", "special"] as const;
export const SECT_POOL = "map" as const;

/** TOML 中的一张图片。 */
export const SourceImageSchema = z
  .strictObject({
    url: UrlSchema,
    comment: TextSchema.optional(),
    tags: TagsSchema.optional(),
  })
  .describe("TOML 中的一张图片。");
export type SourceImage = z.output<typeof SourceImageSchema>;

/** 非空图片数组。 */
export const SourceImagesSchema = z.array(SourceImageSchema).min(1);

/** 人物的三个固定图片分类。 */
export const CharacterImagePoolsSchema = z
  .strictObject({
    default: SourceImagesSchema.optional(),
    female: SourceImagesSchema.optional(),
    special: SourceImagesSchema.optional(),
  })
  .refine((pools) => Object.keys(pools).length > 0, "至少需要一个图片分类")
  .meta({ minProperties: 1 });

/** `data/character/<name>.toml` 的根类型。 */
export const CharacterSourceSchema = z
  .strictObject({
    images: CharacterImagePoolsSchema,
  })
  .describe("`data/character/<name>.toml` 的根类型。");

/** `data/sect/<name>.toml` 的根类型。 */
export const SectSourceSchema = z
  .strictObject({
    images: z.strictObject({ map: SourceImagesSchema }),
  })
  .describe("`data/sect/<name>.toml` 的根类型。");

const ThemeCharactersSchema = z
  .record(NameSchema, z.strictObject({ images: SourceImagesSchema }))
  .refine((characters) => Object.keys(characters).length > 0, "characters 不能为空")
  .meta({ minProperties: 1 });

/** `data/themes/<theme>.toml` 的根类型。 */
export const ThemeSourceSchema = z
  .strictObject({
    description: TextSchema.optional(),
    comment: TextSchema.optional(),
    tags: TagsSchema.optional(),
    characters: ThemeCharactersSchema.optional(),
  })
  .refine(
    (source) => Boolean(source.description || source.comment || source.characters),
    "至少需要 description、comment 或 characters 之一",
  )
  .describe("`data/themes/<theme>.toml` 的根类型。")
  .meta({
    not: {
      properties: {
        description: false,
        comment: false,
        characters: false,
      },
    },
  });
