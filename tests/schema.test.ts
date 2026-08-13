import * as fs from "node:fs";
import * as path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

import {
  ProjectPaths,
  buildArtifacts,
  jsonSchema,
  staleArtifacts,
} from "../src/artifacts.js";
import { loadCatalog } from "../src/catalog.js";
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

  it("committed artifacts match the build byte-for-byte", () => {
    const paths = new ProjectPaths(ROOT);
    const build = buildArtifacts(paths, loadCatalog(ROOT));
    expect(staleArtifacts(build)).toEqual([]);
  });
});
