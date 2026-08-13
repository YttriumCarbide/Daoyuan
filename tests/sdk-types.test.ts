import { describe, expect, expectTypeOf, it } from "vitest";

import { ImageIndexSchema } from "../src/sdk/parse.js";
import { firstImage, getEntity, getImages, imagesForTheme, query } from "../src/sdk/query.js";
import type { Entity, Image, ImageIndex } from "../src/sdk/types.js";

function compileTimeContract(index: ImageIndex): void {
  const name: string = "动态角色";
  const theme: string = "future";
  getEntity(index, name);
  imagesForTheme(index, name, theme);
}

function chainableContract(index: ImageIndex): void {
  const name: string = "动态角色";
  const theme: string = "future";
  firstImage(index.data.entities[name]!);
  query(index).entity(name).theme(theme).all();
  query(index).entity(name).theme(theme).first();
  query(index).entity(name).theme(theme).legacy();
}

describe("sdk dynamic document types", () => {
  it("keeps entity names and themes open", () => {
    expectTypeOf<keyof ImageIndex["data"]["entities"]>().toEqualTypeOf<string>();
    expectTypeOf<Image["theme"]>().toEqualTypeOf<string>();
    expectTypeOf<Parameters<typeof getEntity>[1]>().toEqualTypeOf<string>();
    expectTypeOf<Parameters<typeof imagesForTheme>[2]>().toEqualTypeOf<string>();
    expectTypeOf<ReturnType<typeof ImageIndexSchema.parse>>().toEqualTypeOf<ImageIndex>();
    expect(typeof compileTimeContract).toBe("function");
    expect(typeof chainableContract).toBe("function");
  });

  it("types entity images as a non-empty readonly tuple", () => {
    expectTypeOf<Entity["images"]>().toEqualTypeOf<readonly [Image, ...Image[]]>();
    expectTypeOf<ReturnType<typeof getImages>>().toEqualTypeOf<
      readonly [Image, ...Image[]]
    >();
    expectTypeOf<ReturnType<typeof firstImage>>().toEqualTypeOf<Image>();
  });

  it("types the chainable query builder", () => {
    expectTypeOf<ReturnType<ReturnType<typeof query>["entity"]>>().toEqualTypeOf<
      ReturnType<typeof query>
    >();
    expectTypeOf<ReturnType<ReturnType<typeof query>["theme"]>>().toEqualTypeOf<
      ReturnType<typeof query>
    >();
    expectTypeOf<ReturnType<ReturnType<typeof query>["all"]>>().toEqualTypeOf<
      readonly Image[]
    >();
    expectTypeOf<ReturnType<ReturnType<typeof query>["first"]>>().toEqualTypeOf<
      Image | undefined
    >();
    expectTypeOf<ReturnType<ReturnType<typeof query>["legacy"]>>().toEqualTypeOf<string>();
    expectTypeOf<Parameters<ReturnType<typeof query>["entity"]>[0]>().toEqualTypeOf<string>();
    expectTypeOf<Parameters<ReturnType<typeof query>["theme"]>[0]>().toEqualTypeOf<string>();
  });
});
