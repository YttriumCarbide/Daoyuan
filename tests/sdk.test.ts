import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

import * as sdk from "../src/sdk/index.js";
import { ImageIndexSchema, parseImages } from "../src/sdk/parse.js";
import { firstImage, getEntity, getImages, imagesForTheme, query } from "../src/sdk/query.js";
import { ROOT } from "./helpers.js";

describe("image sdk", () => {
  it("keeps the root entry as the complete public facade", () => {
    expect(sdk.parseImages).toBe(parseImages);
    expect(sdk.ImageIndexSchema).toBe(ImageIndexSchema);
    expect(sdk.getEntity).toBe(getEntity);
    expect(sdk.imagesForTheme).toBe(imagesForTheme);
    expect(sdk.query).toBe(query);
  });

  it("parses and queries images.json", () => {
    const index = parseImages(fs.readFileSync(path.join(ROOT, "images.json"), "utf8"));

    const entity = getEntity(index, "白薇");
    expect(entity).toBeDefined();
    expect(getImages(entity!)).not.toHaveLength(0);
    expect(firstImage(entity!)).toBeDefined();
  });

  it("filters images by theme", () => {
    const index = parseImages(fs.readFileSync(path.join(ROOT, "images.json"), "utf8"));

    const defaults = imagesForTheme(index, "白薇", "default");
    expect(defaults.length).toBeGreaterThan(0);
    expect(defaults.every((image) => image.theme === "default")).toBe(true);
  });

  it("chains queries from the index", () => {
    const index = parseImages(fs.readFileSync(path.join(ROOT, "images.json"), "utf8"));
    const entity = getEntity(index, "白薇")!;
    const defaults = imagesForTheme(index, "白薇", "default");

    expect(query(index).entity("白薇").all()).toEqual(getImages(entity));
    expect(query(index).entity("白薇").first()).toBe(firstImage(entity));
    expect(query(index).entity("白薇").theme("default").all()).toEqual(defaults);
    expect(query(index).entity("白薇").theme("default").first()).toBe(defaults[0]);
    expect(query(index).entity("白薇").theme("default").legacy()).toBe(
      defaults.map((image) => image.url).join("|"),
    );
  });

  it("returns empty results for missing entities", () => {
    const index = parseImages(fs.readFileSync(path.join(ROOT, "images.json"), "utf8"));

    expect(query(index).entity("不存在的角色").all()).toEqual([]);
    expect(query(index).entity("不存在的角色").first()).toBeUndefined();
    expect(query(index).entity("不存在的角色").legacy()).toBe("");
  });

  it("keeps chain builders immutable", () => {
    const index = parseImages(fs.readFileSync(path.join(ROOT, "images.json"), "utf8"));
    const entity = getEntity(index, "白薇")!;

    const base = query(index).entity("白薇");
    const themed = base.theme("default");
    expect(base.all()).toEqual(getImages(entity));
    expect(base.first()).toBe(firstImage(entity));
    expect(themed.all()).toEqual(imagesForTheme(index, "白薇", "default"));
  });

  it("rejects an invalid document", () => {
    expect(() => parseImages({ schemaVersion: 1, data: { entities: {} } })).toThrow();
  });

  it("keeps dynamic names open in the runtime schema", () => {
    expect(
      ImageIndexSchema.safeParse({
        schemaVersion: 2,
        data: {
          entities: {
            未来角色: {
              type: "character",
              images: [
                {
                  url: "https://example.com/future.png",
                  theme: "future",
                  tags: [],
                },
              ],
            },
          },
        },
      }).success,
    ).toBe(true);
  });
});
