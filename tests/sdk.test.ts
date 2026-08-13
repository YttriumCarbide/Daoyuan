import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

import { firstImage, getEntity, getImages, imagesForTheme, parseImages } from "../src/sdk.js";
import { ROOT } from "./helpers.js";

describe("image sdk", () => {
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

    expect(imagesForTheme(index, "白薇", "不存在的主题")).toEqual([]);
    expect(imagesForTheme(index, "不存在的实体", "default")).toEqual([]);
  });

  it("rejects an invalid document", () => {
    expect(() => parseImages({ schemaVersion: 1, data: { entities: {} } })).toThrow();
  });
});
