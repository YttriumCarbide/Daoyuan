import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

import { ROOT } from "./helpers.js";

interface PackageManifest {
  files: string[];
  dependencies: Record<string, string>;
  exports: Record<string, unknown>;
}

describe("package boundary", () => {
  it("maps public entries to the SDK layers", () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
    ) as PackageManifest;

    expect(manifest.files).toEqual(["dist/sdk"]);
    expect(Object.keys(manifest.dependencies)).toEqual(["zod"]);
    expect(manifest.exports).toEqual({
      ".": {
        types: "./dist/sdk/index.d.ts",
        import: "./dist/sdk/index.js",
      },
      "./query": {
        types: "./dist/sdk/query.d.ts",
        import: "./dist/sdk/query.js",
      },
      "./schema": {
        types: "./dist/sdk/parse.d.ts",
        import: "./dist/sdk/parse.js",
      },
      "./types": {
        types: "./dist/sdk/types.d.ts",
        import: "./dist/sdk/types.js",
      },
    });
  });

  it("keeps SDK sources independent from CLI sources", () => {
    const sdkDirectory = path.join(ROOT, "src", "sdk");
    for (const name of fs.readdirSync(sdkDirectory).filter((file) => file.endsWith(".ts"))) {
      const source = fs.readFileSync(path.join(sdkDirectory, name), "utf8");
      expect(source).not.toMatch(/from ["']\.\.\/cli(?:\/|["'])/);
    }
  });

  it("keeps the query layer free of runtime imports", () => {
    const source = fs.readFileSync(path.join(ROOT, "src", "sdk", "query.ts"), "utf8");
    expect(source).not.toMatch(/^import(?!\s+type\b)/m);
    expect(source).not.toContain("schema.js");
    expect(source).not.toContain("zod");
  });
});
