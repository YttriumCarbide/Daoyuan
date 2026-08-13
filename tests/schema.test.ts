import * as fs from "node:fs";
import * as path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

import {
  ProjectPaths,
  buildArtifacts,
  jsonSchema,
  staleArtifacts,
} from "../src/cli/artifacts.js";
import { loadCatalog } from "../src/cli/catalog.js";
import { CharacterSourceSchema, ThemeSourceSchema } from "../src/cli/source-schema.js";
import { ImageIndexSchema } from "../src/sdk/schema.js";
import { ROOT } from "./helpers.js";

describe("json schema", () => {
  it("source schemas have no union dispatch", () => {
    for (const kind of ["character", "sect", "theme"] as const) {
      const encoded = JSON.stringify(jsonSchema(kind));
      expect(encoded).not.toContain('"anyOf"');
      expect(encoded).not.toContain('"oneOf"');
      expect(encoded).not.toContain('"if"');
    }
  });

  it("output schema validates the committed images.json", () => {
    const ajv = new Ajv2020({ strict: false });
    const validate = ajv.compile(jsonSchema("output"));
    const images = JSON.parse(fs.readFileSync(path.join(ROOT, "images.json"), "utf8"));
    expect(validate(images)).toBe(true);
  });

  it("schemas reject empty pools and entities", () => {
    const ajv = new Ajv2020({ strict: false });

    const validateOutput = ajv.compile(jsonSchema("output"));
    expect(validateOutput({ schemaVersion: 2, data: { entities: {} } })).toBe(false);

    const validateCharacter = ajv.compile(jsonSchema("character"));
    expect(validateCharacter({ images: {} })).toBe(false);

    const validateTheme = ajv.compile(jsonSchema("theme"));
    expect(validateTheme({})).toBe(false);
  });

  it("theme runtime and JSON schemas agree on root-field requirements", () => {
    const ajv = new Ajv2020({ strict: false });
    const validate = ajv.compile(jsonSchema("theme"));
    const cases: Array<[input: unknown, valid: boolean]> = [
      [{}, false],
      [{ tags: ["event"] }, false],
      [{ description: "维护说明" }, true],
      [{ comment: "默认说明", tags: ["event"] }, true],
      [{ description: "维护说明", tags: ["event", "event"] }, false],
      [{ description: "维护说明", characters: {} }, false],
      [
        {
          characters: {
            测试角色: { images: [{ url: "https://example.com/a.png" }] },
          },
        },
        true,
      ],
    ];

    for (const [input, valid] of cases) {
      expect(ThemeSourceSchema.safeParse(input).success).toBe(valid);
      expect(validate(input)).toBe(valid);
    }
  });

  it("runtime and JSON schemas agree on generated refinement metadata", () => {
    const ajv = new Ajv2020({ strict: false });
    const validateCharacter = ajv.compile(jsonSchema("character"));
    const validateOutput = ajv.compile(jsonSchema("output"));
    const cases = [
      {
        runtime: CharacterSourceSchema,
        validate: validateCharacter,
        input: { images: {} },
      },
      {
        runtime: CharacterSourceSchema,
        validate: validateCharacter,
        input: {
          images: {
            default: [
              {
                url: "https://example.com/a.png",
                tags: ["event", "event"],
              },
            ],
          },
        },
      },
      {
        runtime: ImageIndexSchema,
        validate: validateOutput,
        input: { schemaVersion: 2, data: { entities: {} } },
      },
    ];

    for (const { runtime, validate, input } of cases) {
      expect(runtime.safeParse(input).success).toBe(false);
      expect(validate(input)).toBe(false);
    }
  });

  it("committed artifacts match the build byte-for-byte", () => {
    const paths = new ProjectPaths(ROOT);
    const build = buildArtifacts(paths, loadCatalog(ROOT));
    expect(staleArtifacts(build)).toEqual([]);
  });
});
