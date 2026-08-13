import * as fs from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

import { BuildError, loadCatalog } from "../src/cli/catalog.js";
import {
  ProjectPaths,
  buildArtifacts,
  buildIndex,
  staleArtifacts,
  writeArtifacts,
} from "../src/cli/artifacts.js";
import { run } from "../src/cli/run.js";
import { CharacterSourceSchema, ThemeSourceSchema } from "../src/cli/source-schema.js";
import { ImageIndexSchema } from "../src/sdk/schema.js";
import { ProjectFixture } from "./helpers.js";

const fixtures: ProjectFixture[] = [];

function fixture(): ProjectFixture {
  const created = new ProjectFixture();
  fixtures.push(created);
  return created;
}

afterEach(() => {
  for (const created of fixtures.splice(0)) {
    created.cleanup();
  }
});

describe("image pipeline", () => {
  it("source model is an object list with optional metadata", () => {
    const source = CharacterSourceSchema.parse({
      images: {
        default: [{ url: "https://example.com/image.webp", tags: ["v53"] }],
      },
    });
    const images = source.images.default;
    expect(images).toBeDefined();
    expect(images![0]!.tags).toEqual(["v53"]);
    expect(images![0]!.comment).toBeUndefined();

    expect(() =>
      CharacterSourceSchema.parse({ images: { default: [{ url: "https://example.com/a.webp " }] } }),
    ).toThrow();
    expect(() =>
      CharacterSourceSchema.parse({ images: { default: ["https://example.com/a.webp"] } }),
    ).toThrow();
    expect(() =>
      CharacterSourceSchema.parse({ images: { map: [{ url: "https://example.com/map.webp" }] } }),
    ).toThrow();
  });

  it("catalog builds typed index in stable pool order", () => {
    const created = fixture();
    created.populate();

    const index = buildIndex(loadCatalog(created.root));
    const entity = index.data.entities["测试角色"]!;

    expect(entity.type).toBe("character");
    expect(entity.images.map((image) => [image.theme, image.url])).toEqual([
      ["default", "https://example.com/default.png"],
      ["special", "https://example.com/special.png"],
      ["tarot", "https://example.com/tarot.png"],
    ]);
    expect(entity.images[1]!.tags).toEqual(["event"]);
    expect(entity.images[2]!.comment).toBe("魔术师");
  });

  it("theme global fields merge into theme images", () => {
    const created = fixture();
    created.populate();
    created.write(
      "data/themes/wedding.toml",
      `
      description = "婚纱立绘"
      comment = "婚纱"
      tags = ["WIKI-2026-W32"]

      [characters."测试角色"]
      images = [
        { url = "https://example.com/wedding-1.png" },
        { url = "https://example.com/wedding-2.png", comment = "特写", tags = ["WIKI-2026-W32", "event"] },
        { url = "https://example.com/wedding-3.png", tags = [] },
      ]
      `,
    );

    const index = buildIndex(loadCatalog(created.root));
    const wedding = index.data.entities["测试角色"]!.images.filter(
      (image) => image.theme === "wedding",
    );

    expect(wedding[0]!.comment).toBe("婚纱");
    expect(wedding[0]!.tags).toEqual(["WIKI-2026-W32"]);
    expect(wedding[1]!.comment).toBe("特写");
    expect(wedding[1]!.tags).toEqual(["WIKI-2026-W32", "event"]);
    expect(wedding[2]!.comment).toBe("婚纱");
    expect(wedding[2]!.tags).toEqual([]);
  });

  it("theme root tags are validated", () => {
    expect(() =>
      ThemeSourceSchema.parse({
        characters: {
          测试角色: { images: [{ url: "https://example.com/a.png" }] },
        },
        tags: ["a", "a"],
      }),
    ).toThrow(/不能包含重复值/);

    expect(() => ThemeSourceSchema.parse({ tags: ["a"] })).toThrow();
  });

  it("build writes and checks every artifact", () => {
    const created = fixture();
    created.populate();
    const paths = new ProjectPaths(created.root);
    const build = buildArtifacts(paths, loadCatalog(created.root));

    expect(Object.keys(build.artifacts)).toHaveLength(8);
    expect(staleArtifacts(build).sort()).toEqual(Object.keys(build.artifacts).sort());
    writeArtifacts(build);
    expect(staleArtifacts(build)).toEqual([]);
    expect(run(created.root, true)).toBe(0);

    const document = ImageIndexSchema.parse(JSON.parse(fs.readFileSync(paths.images, "utf8")));
    expect(Object.keys(document.data.entities)).toHaveLength(2);
    const portraits = JSON.parse(fs.readFileSync(paths.portraits, "utf8"));
    expect(portraits.charPortraits["测试角色"]).toBe(
      "https://example.com/default.png|https://example.com/tarot.png",
    );
    const sectMaps = JSON.parse(fs.readFileSync(paths.sectMaps, "utf8"));
    expect(sectMaps["玄天界"]["万法宗"]).toBe("https://example.com/map.png");
    expect(sectMaps["玄天界"]["黑金阁"]).toBe("");
    expect(sectMaps).toHaveProperty("九天仙界");
    const sdkTypes = fs.readFileSync(paths.sdkTypes, "utf8");
    expect(sdkTypes).toContain('export type EntityName =\n  | "万法宗"\n  | "测试角色";');
    expect(sdkTypes).toContain('export type ImageTheme =\n  | "default"');
    expect(sdkTypes).not.toContain("export const");
  });

  it("legacy sect maps rejects unmapped sects", () => {
    const created = fixture();
    created.populate();
    created.write(
      "data/sect/测试宗门.toml",
      '[images]\nmap = [{ url = "https://example.com/map.png" }]',
    );

    expect(() =>
      buildArtifacts(new ProjectPaths(created.root), loadCatalog(created.root)),
    ).toThrow(/类别未配置：测试宗门/);
  });

  it("check reports drift without writing", () => {
    const created = fixture();
    created.populate();
    const paths = new ProjectPaths(created.root);
    const build = buildArtifacts(paths, loadCatalog(created.root));
    writeArtifacts(build);
    fs.writeFileSync(paths.images, "{}\n", "utf8");

    expect(run(created.root, true)).toBe(1);
    expect(fs.readFileSync(paths.images, "utf8")).toBe("{}\n");
  });

  it("catalog rejects duplicate urls with source context", () => {
    const created = fixture();
    created.write(
      "data/character/测试角色.toml",
      `
      [images]
      default = [
        { url = "https://example.com/a.png" },
        { url = "https://example.com/a.png", comment = "重复" },
      ]
      `,
    );

    expect(() => loadCatalog(created.root)).toThrow(/测试角色\.toml.*\[default\].*重复 URL/);
  });

  it("catalog rejects cross-kind name collisions", () => {
    const created = fixture();
    created.write(
      "data/character/同名.toml",
      '[images]\ndefault = [{ url = "https://example.com/a.png" }]',
    );
    created.write(
      "data/sect/同名.toml",
      '[images]\nmap = [{ url = "https://example.com/map.png" }]',
    );

    expect(() => loadCatalog(created.root)).toThrow(/同时声明/);
  });

  it("new themes stay in modern output without expanding legacy", () => {
    const created = fixture();
    created.populate();
    created.write(
      "data/themes/festival.toml",
      `
      [characters."测试角色"]
      images = [{ url = "https://example.com/festival.png" }]
      `,
    );

    const paths = new ProjectPaths(created.root);
    const build = buildArtifacts(paths, loadCatalog(created.root));
    const document = JSON.parse(build.artifacts[paths.images]!);
    const themes = document.data.entities["测试角色"].images.map(
      (image: { theme: string }) => image.theme,
    );

    expect(themes).toContain("festival");
    expect(build.warnings).toEqual(["主题池 [festival] 无对应 legacy 分区，已跳过"]);
  });

  it("raises BuildError for a missing data directory", () => {
    const created = fixture();
    expect(() => loadCatalog(created.root)).toThrow(BuildError);
  });
});
