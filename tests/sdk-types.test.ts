import { describe, expect, expectTypeOf, it } from "vitest";

import { ImageIndexSchema, getEntity, imagesForTheme } from "../src/sdk/index.js";
import type { Image, ImageIndex } from "../src/sdk/index.js";

function compileTimeContract(index: ImageIndex): void {
  const name: string = "动态角色";
  const theme: string = "future";
  getEntity(index, name);
  imagesForTheme(index, name, theme);
}

describe("sdk dynamic document types", () => {
  it("keeps entity names and themes open", () => {
    expectTypeOf<keyof ImageIndex["data"]["entities"]>().toEqualTypeOf<string>();
    expectTypeOf<Image["theme"]>().toEqualTypeOf<string>();
    expectTypeOf<Parameters<typeof getEntity>[1]>().toEqualTypeOf<string>();
    expectTypeOf<Parameters<typeof imagesForTheme>[2]>().toEqualTypeOf<string>();
    expectTypeOf<ReturnType<typeof ImageIndexSchema.parse>>().toEqualTypeOf<ImageIndex>();
    expect(typeof compileTimeContract).toBe("function");
  });
});
