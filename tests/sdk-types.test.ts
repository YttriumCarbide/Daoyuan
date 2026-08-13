import { describe, expect, expectTypeOf, it } from "vitest";

import { ImageIndexSchema, getEntity, imagesForTheme } from "../src/sdk/index.js";
import type { EntityName, ImageIndex, ImageTheme } from "../src/sdk/index.js";

function compileTimeContract(index: ImageIndex): void {
  getEntity(index, "白薇");
  imagesForTheme(index, "白薇", "default");

  // @ts-expect-error 未发布的实体名必须在编译期失败。
  getEntity(index, "不存在的实体");
  // @ts-expect-error 未发布的主题必须在编译期失败。
  imagesForTheme(index, "白薇", "future");
}

describe("sdk snapshot types", () => {
  it("uses the generated entity union as the index key", () => {
    expectTypeOf<EntityName>().toEqualTypeOf<keyof ImageIndex["data"]["entities"]>();
    expectTypeOf<"白薇">().toExtend<EntityName>();
    expectTypeOf<"default">().toExtend<ImageTheme>();
    expectTypeOf<ReturnType<typeof ImageIndexSchema.parse>>().toEqualTypeOf<ImageIndex>();
    expect(typeof compileTimeContract).toBe("function");
  });
});
